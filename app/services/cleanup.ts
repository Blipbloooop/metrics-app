import * as k8s from '@kubernetes/client-node'
import prisma from '@/lib/prisma'

const WATCH_NAMESPACES = ['app-production', 'app-staging', 'default']
const RELEASED_RETENTION_MS = 24 * 60 * 60 * 1000
const FINISHED_JOB_TTL_S    = 120

const kc = new k8s.KubeConfig()
kc.loadFromDefault()
const batchApi = kc.makeApiClient(k8s.BatchV1Api)
const coreApi  = kc.makeApiClient(k8s.CoreV1Api)

export interface CleanupResult {
  reservations_purged: number
  orphan_quotas_deleted: number
  orphan_limits_deleted: number
  finished_jobs_deleted: number
  errors: string[]
  ran_at: string
}

// Purge les réservations en statut released/failed depuis plus de 24h
async function purgeOldReservations(): Promise<number> {
  const cutoff = new Date(Date.now() - RELEASED_RETENTION_MS)
  const { count } = await prisma.reservation.deleteMany({
    where: {
      OR: [
        { status: 'released', released_at: { lte: cutoff } },
        { status: 'failed',   reserved_at: { lte: cutoff } },
      ],
    },
  })
  if (count > 0) console.log(`[cleanup] Purged ${count} old reservation(s)`)
  return count
}

// Supprime les ResourceQuotas portant le préfixe "reservation-" sans réservation active associée
async function deleteOrphanQuotas(namespace: string, errors: string[]): Promise<number> {
  let deleted = 0
  try {
    const res = await coreApi.listNamespacedResourceQuota({ namespace })
    const reservationQuotas = res.items.filter((q) =>
      q.metadata?.name?.startsWith('reservation-'),
    )

    for (const quota of reservationQuotas) {
      const name = quota.metadata?.name ?? ''
      // Le nom suit la convention "reservation-<deployment_name>"
      const deploymentName = name.replace(/^reservation-/, '')
      const active = await prisma.reservation.findFirst({
        where: { status: 'active', namespace, deployment_name: deploymentName },
      })
      if (!active) {
        try {
          await coreApi.deleteNamespacedResourceQuota({ name, namespace })
          console.log(`[cleanup] Deleted orphan quota ${name} in ${namespace}`)
          deleted++
        } catch (err) {
          errors.push(`quota ${name}: ${err instanceof Error ? err.message : err}`)
        }
      }
    }
  } catch (err) {
    errors.push(`list quotas in ${namespace}: ${err instanceof Error ? err.message : err}`)
  }
  return deleted
}

// Supprime les LimitRanges portant le préfixe "reservation-" sans réservation active associée
async function deleteOrphanLimitRanges(namespace: string, errors: string[]): Promise<number> {
  let deleted = 0
  try {
    const res = await coreApi.listNamespacedLimitRange({ namespace })
    const reservationLimits = res.items.filter((lr) =>
      lr.metadata?.name?.startsWith('reservation-'),
    )

    for (const lr of reservationLimits) {
      const lrName = lr.metadata?.name ?? ''
      const deploymentName = lrName.replace(/^reservation-/, '')
      const active = await prisma.reservation.findFirst({
        where: { status: 'active', namespace, deployment_name: deploymentName },
      })
      if (!active) {
        try {
          await coreApi.deleteNamespacedLimitRange({ name: lrName, namespace })
          console.log(`[cleanup] Deleted orphan limit-range ${lrName} in ${namespace}`)
          deleted++
        } catch (err) {
          errors.push(`limitrange ${lrName}: ${err instanceof Error ? err.message : err}`)
        }
      }
    }
  } catch (err) {
    errors.push(`list limitranges in ${namespace}: ${err instanceof Error ? err.message : err}`)
  }
  return deleted
}

// Supprime les Jobs terminés depuis plus de FINISHED_JOB_TTL_S secondes (TTLAfterFinished applicatif)
async function deleteFinishedJobs(namespace: string, errors: string[]): Promise<number> {
  let deleted = 0
  const cutoff = new Date(Date.now() - FINISHED_JOB_TTL_S * 1000)
  try {
    const res = await batchApi.listNamespacedJob({ namespace })
    for (const job of res.items) {
      const conditions = job.status?.conditions ?? []
      const isDone = conditions.some(
        (c) => (c.type === 'Complete' || c.type === 'Failed') && c.status === 'True',
      )
      if (!isDone) continue

      const completionTime = job.status?.completionTime
      if (!completionTime || new Date(completionTime) > cutoff) continue

      const jobName = job.metadata?.name ?? ''
      try {
        await batchApi.deleteNamespacedJob({
          name: jobName,
          namespace,
          body: { propagationPolicy: 'Foreground' },
        })
        console.log(`[cleanup] Deleted finished job ${jobName} in ${namespace}`)
        deleted++
      } catch (err) {
        errors.push(`job ${jobName}: ${err instanceof Error ? err.message : err}`)
      }
    }
  } catch (err) {
    errors.push(`list jobs in ${namespace}: ${err instanceof Error ? err.message : err}`)
  }
  return deleted
}

export async function runCleanup(): Promise<CleanupResult> {
  console.log(`[cleanup] Run started at ${new Date().toISOString()}`)
  const errors: string[] = []

  const reservations_purged = await purgeOldReservations()

  let orphan_quotas_deleted  = 0
  let orphan_limits_deleted  = 0
  let finished_jobs_deleted  = 0

  for (const ns of WATCH_NAMESPACES) {
    orphan_quotas_deleted += await deleteOrphanQuotas(ns, errors)
    orphan_limits_deleted += await deleteOrphanLimitRanges(ns, errors)
    finished_jobs_deleted += await deleteFinishedJobs(ns, errors)
  }

  console.log(
    `[cleanup] Done — ${reservations_purged} reservations, ` +
    `${orphan_quotas_deleted} quotas, ${orphan_limits_deleted} limit-ranges, ` +
    `${finished_jobs_deleted} jobs deleted`,
  )

  return {
    reservations_purged,
    orphan_quotas_deleted,
    orphan_limits_deleted,
    finished_jobs_deleted,
    errors,
    ran_at: new Date().toISOString(),
  }
}
