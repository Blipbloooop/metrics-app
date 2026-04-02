import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import {
  createResourceQuota,
  createLimitRange,
  scaleDeployment,
  checkNodeCapacity,
} from '@/app/services/kubernetes-reserve'

const WORKER_NODES = ['k8s-worker-1', 'k8s-worker-2'] as const

const CPU_AUTO_THRESHOLD = 80   // % → réservation automatique
const CPU_URGENT_THRESHOLD = 90 // % → urgent
const RAM_AUTO_THRESHOLD = 85   // % → réservation automatique
const COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes
const SAFETY_MARGIN = 0.15      // 15% de marge de sécurité
const METRICS_WINDOW_MS = 5 * 60 * 1000 // 5 dernières minutes

export async function POST(req: NextRequest) {
  // Auth : même token que l'ingest
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (token !== process.env.METRICS_INGEST_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const namespace = process.env.AUTO_RESERVE_NAMESPACE ?? 'app-production'
  const deploymentName = process.env.AUTO_RESERVE_DEPLOYMENT ?? 'metrics-app'
  const durationMinutes = 60

  const now = new Date()
  const since = new Date(now.getTime() - METRICS_WINDOW_MS)
  const cooldownSince = new Date(now.getTime() - COOLDOWN_MS)

  // 1. Récupérer les métriques et l'état des réservations pour chaque worker
  const nodeStates = await Promise.all(
    WORKER_NODES.map(async (nodeId) => {
      const [metrics, node, recentReservation, activeReservations] = await Promise.all([
        prisma.metricsRaw.findMany({
          where: { node_id: nodeId, collected_at: { gte: since } },
          select: { cpu_percent: true, ram_percent: true },
        }),
        prisma.node.findUnique({ where: { id: nodeId } }),
        prisma.reservation.findFirst({
          where: {
            node_id: nodeId,
            triggered_by: 'automatic',
            reserved_at: { gte: cooldownSince },
          },
          orderBy: { reserved_at: 'desc' },
        }),
        prisma.reservation.count({
          where: { node_id: nodeId, status: 'active' },
        }),
      ])

      if (metrics.length === 0 || !node) return null

      const cpu_avg = metrics.reduce((s, m) => s + m.cpu_percent, 0) / metrics.length
      const ram_avg = metrics.reduce((s, m) => s + m.ram_percent, 0) / metrics.length

      return {
        nodeId,
        node,
        cpu_avg,
        ram_avg,
        inCooldown: recentReservation !== null,
        activeReservations,
      }
    })
  )

  // 2. Filtrer les nodes eligibles
  const eligible = nodeStates.filter(
    (s): s is NonNullable<typeof s> =>
      s !== null &&
      !s.inCooldown &&
      (s.cpu_avg >= CPU_AUTO_THRESHOLD || s.ram_avg >= RAM_AUTO_THRESHOLD)
  )

  if (eligible.length === 0) {
    return NextResponse.json({
      action: 'none',
      reason: 'No node exceeds thresholds or all nodes are in cooldown',
      checked: WORKER_NODES,
    })
  }

  // 3. Scorer les nodes éligibles (PRV-37)
  // score = cpu_avg × 0.5 + ram_avg × 0.3 + active_reservations × 0.2
  const scored = eligible
    .map((s) => ({
      ...s,
      score: s.cpu_avg * 0.5 + s.ram_avg * 0.3 + s.activeReservations * 0.2,
      urgent: s.cpu_avg >= CPU_URGENT_THRESHOLD,
    }))
    .sort((a, b) => b.score - a.score)

  const target = scored[0]

  // 4. Calculer les ressources à réserver avec la marge de sécurité (PRV-40)
  const excessCpuPct = Math.max(0, target.cpu_avg - 70) / 100
  const excessRamPct = Math.max(0, target.ram_avg - 70) / 100

  const cpuPerReplica = Math.max(
    0.1,
    +(target.node.cpu_cores * excessCpuPct + target.node.cpu_cores * SAFETY_MARGIN).toFixed(2)
  )
  const ramPerReplica = Math.max(
    0.1,
    +(target.node.ram_gb * excessRamPct + target.node.ram_gb * SAFETY_MARGIN).toFixed(2)
  )

  // 5. Vérifier capacité K8s
  const capacity = await checkNodeCapacity(target.nodeId, cpuPerReplica, ramPerReplica)
  if (!capacity.available) {
    return NextResponse.json(
      {
        action: 'none',
        reason: `Insufficient capacity on ${target.nodeId}: ${capacity.reason}`,
        node_id: target.nodeId,
        score: target.score,
      },
      { status: 409 }
    )
  }

  // 6. Créer la réservation en DB
  const priority = target.urgent ? 'urgent' : 'auto'
  const reservation = await prisma.reservation.create({
    data: {
      node_id: target.nodeId,
      triggered_by: 'automatic',
      status: 'pending',
      cpu_reserved: cpuPerReplica,
      ram_reserved_gb: ramPerReplica,
      expires_at: new Date(now.getTime() + durationMinutes * 60 * 1000),
      notes: `Auto-réservation ${priority} — CPU ${target.cpu_avg.toFixed(1)}% / RAM ${target.ram_avg.toFixed(1)}%`,
    },
  })

  // 7. Appliquer les changements K8s
  const spec = {
    namespace,
    deployment_name: deploymentName,
    replica_count: 1,
    cpu_per_replica: cpuPerReplica,
    ram_per_replica: ramPerReplica,
  }

  const [quotaOk, limitOk, scaleOk] = await Promise.all([
    createResourceQuota(spec),
    createLimitRange(spec),
    scaleDeployment(namespace, deploymentName, 1),
  ])

  const k8sOk = quotaOk && limitOk && scaleOk

  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: k8sOk ? 'active' : 'failed' },
  })

  // 8. Créer une alerte si urgent
  if (target.urgent) {
    await prisma.alert.create({
      data: {
        node_id: target.nodeId,
        type: 'threshold_exceeded',
        severity: 'critical',
        message: `Réservation urgente sur ${target.nodeId} — CPU ${target.cpu_avg.toFixed(1)}% (seuil ${CPU_URGENT_THRESHOLD}%)`,
        threshold: CPU_URGENT_THRESHOLD,
        actual_value: target.cpu_avg,
      },
    })
  }

  return NextResponse.json(
    {
      action: k8sOk ? 'reserved' : 'failed',
      reservation_id: reservation.id,
      node_id: target.nodeId,
      priority,
      score: +target.score.toFixed(3),
      cpu_avg: +target.cpu_avg.toFixed(1),
      ram_avg: +target.ram_avg.toFixed(1),
      cpu_reserved: cpuPerReplica,
      ram_reserved_gb: ramPerReplica,
      k8s: { quota: quotaOk, limit_range: limitOk, scaled: scaleOk },
      expires_at: reservation.expires_at?.toISOString(),
    },
    { status: k8sOk ? 201 : 207 }
  )
}
