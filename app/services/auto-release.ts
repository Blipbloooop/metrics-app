import * as k8s from '@kubernetes/client-node'
import prisma from '@/lib/prisma'
import { deleteReservationResources, scaleDeployment } from './kubernetes-reserve'

// Seuils de relâchement : si CPU ET RAM passent sous ces valeurs pendant 5 min → release
const RELEASE_CPU_THRESHOLD = Number(process.env.RELEASE_CPU_THRESHOLD ?? 30)
const RELEASE_RAM_THRESHOLD = Number(process.env.RELEASE_RAM_THRESHOLD ?? 30)
const METRICS_WINDOW_MS = 5 * 60 * 1000

// Namespaces à surveiller pour les K8s Jobs
const WATCH_NAMESPACES = ['app-production', 'ai-module', 'default']

// Fenêtre d'association job → réservation : un job terminé dans les 2h déclenche la vérification
const JOB_COMPLETION_WINDOW_MS = 2 * 60 * 60 * 1000

const kc = new k8s.KubeConfig()
kc.loadFromDefault()
const batchApi = kc.makeApiClient(k8s.BatchV1Api)

export interface ReleaseResult {
  reservation_id: string
  node_id: string
  trigger: 'expired' | 'load_dropped' | 'job_completed'
  success: boolean
  error?: string
}

interface ActiveReservation {
  id: string
  node_id: string
  namespace: string | null
  deployment_name: string | null
  reserved_at: Date
}

async function releaseOne(
  reservation: ActiveReservation,
  trigger: ReleaseResult['trigger'],
): Promise<ReleaseResult> {
  try {
    // Nettoyage K8s uniquement si namespace + deployment_name sont connus
    if (reservation.namespace && reservation.deployment_name) {
      // allSettled : on continue même si K8s échoue (la réservation DB doit toujours être libérée)
      await Promise.allSettled([
        scaleDeployment(reservation.namespace, reservation.deployment_name, 1),
        deleteReservationResources(reservation.namespace, reservation.deployment_name),
      ])
    }

    await prisma.reservation.update({
      where: { id: reservation.id },
      data: {
        status: 'released',
        released_at: new Date(),
        release_reason: trigger,
      },
    })

    console.log(`[auto-release] Released ${reservation.id} (${reservation.node_id}) — trigger: ${trigger}`)
    return { reservation_id: reservation.id, node_id: reservation.node_id, trigger, success: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.error(`[auto-release] Failed to release ${reservation.id}: ${error}`)
    return { reservation_id: reservation.id, node_id: reservation.node_id, trigger, success: false, error }
  }
}

// ─── Trigger 1 : expiration basée sur expires_at ─────────────────────────────
export async function releaseExpired(): Promise<ReleaseResult[]> {
  const expired = await prisma.reservation.findMany({
    where: { status: 'active', expires_at: { lte: new Date() } },
    select: { id: true, node_id: true, namespace: true, deployment_name: true, reserved_at: true },
  })

  if (expired.length > 0) {
    console.log(`[auto-release] Found ${expired.length} expired reservation(s)`)
  }

  const results: ReleaseResult[] = []
  for (const r of expired) {
    results.push(await releaseOne(r, 'expired'))
  }
  return results
}

// ─── Trigger 2 : charge descendue sous le seuil de relâchement ───────────────
// Uniquement pour les réservations automatiques (les manuelles ont une durée explicite)
export async function releaseOnLoadDrop(): Promise<ReleaseResult[]> {
  const active = await prisma.reservation.findMany({
    where: { status: 'active', triggered_by: 'automatic' },
    select: { id: true, node_id: true, namespace: true, deployment_name: true, reserved_at: true },
  })

  const results: ReleaseResult[] = []
  const since = new Date(Date.now() - METRICS_WINDOW_MS)

  for (const r of active) {
    const metrics = await prisma.metricsRaw.findMany({
      where: { node_id: r.node_id, collected_at: { gte: since } },
      select: { cpu_percent: true, ram_percent: true },
    })

    if (metrics.length < 3) continue // Pas assez de points pour décider

    const cpuAvg = metrics.reduce((s, m) => s + m.cpu_percent, 0) / metrics.length
    const ramAvg = metrics.reduce((s, m) => s + m.ram_percent, 0) / metrics.length

    if (cpuAvg < RELEASE_CPU_THRESHOLD && ramAvg < RELEASE_RAM_THRESHOLD) {
      console.log(
        `[auto-release] Load dropped on ${r.node_id}: CPU ${cpuAvg.toFixed(1)}% / RAM ${ramAvg.toFixed(1)}% — releasing ${r.id}`,
      )
      results.push(await releaseOne(r, 'load_dropped'))
    }
  }
  return results
}

// ─── Trigger 3 : job K8s terminé (Completed ou Failed) ───────────────────────
// Logique : un Job terminé récemment dans un namespace signifie que la charge est retombée.
// On relâche les réservations actives sur le node associé qui ont été créées AVANT la fin du job.
export async function releaseOnJobCompletion(): Promise<ReleaseResult[]> {
  const results: ReleaseResult[] = []
  const cutoff = new Date(Date.now() - JOB_COMPLETION_WINDOW_MS)

  for (const namespace of WATCH_NAMESPACES) {
    let jobs: k8s.V1Job[] = []
    try {
      const response = await batchApi.listNamespacedJob({ namespace })
      jobs = response.items
    } catch (err) {
      console.warn(`[auto-release] Cannot list jobs in ${namespace}: ${err instanceof Error ? err.message : err}`)
      continue
    }

    // Jobs terminés (Complete ou Failed) dans la fenêtre de temps
    const recentlyCompleted = jobs.filter((job) => {
      const conditions = job.status?.conditions ?? []
      const isDone = conditions.some(
        (c) => (c.type === 'Complete' || c.type === 'Failed') && c.status === 'True',
      )
      if (!isDone) return false

      // Le job s'est terminé dans la fenêtre de 2h
      const completionTime = job.status?.completionTime
      return completionTime ? new Date(completionTime) >= cutoff : false
    })

    if (recentlyCompleted.length === 0) continue

    // Trouver les réservations actives dans ce namespace ou sur le node associé
    const jobCompletionTimes = recentlyCompleted
      .map((j) => j.status?.completionTime)
      .filter(Boolean) as Date[]
    const earliestCompletion = new Date(Math.min(...jobCompletionTimes.map((d) => new Date(d).getTime())))

    // Réservations actives créées avant la fin du job le plus ancien dans ce namespace
    const matching = await prisma.reservation.findMany({
      where: {
        status: 'active',
        namespace,
        reserved_at: { lte: earliestCompletion },
      },
      select: { id: true, node_id: true, namespace: true, deployment_name: true, reserved_at: true },
    })

    for (const r of matching) {
      console.log(
        `[auto-release] Job(s) completed in ${namespace} — releasing reservation ${r.id} on ${r.node_id}`,
      )
      results.push(await releaseOne(r, 'job_completed'))
    }
  }
  return results
}

// ─── Point d'entrée principal ─────────────────────────────────────────────────
export async function runAutoRelease(): Promise<{
  expired: ReleaseResult[]
  load_dropped: ReleaseResult[]
  job_completed: ReleaseResult[]
  total_released: number
  ran_at: string
}> {
  console.log(`[auto-release] Run started at ${new Date().toISOString()}`)

  // Séquentiel pour éviter les double-releases (chaque trigger lit status='active')
  const expired = await releaseExpired()
  const load_dropped = await releaseOnLoadDrop()
  const job_completed = await releaseOnJobCompletion()

  const total_released = expired.length + load_dropped.length + job_completed.length
  console.log(`[auto-release] Done — ${total_released} reservation(s) released`)

  return { expired, load_dropped, job_completed, total_released, ran_at: new Date().toISOString() }
}
