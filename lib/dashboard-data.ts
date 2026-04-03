import { prisma } from '@/lib/prisma'
import type { NodeCurrentMetrics, ActiveReservation } from '@/lib/types/dashboard'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2'] as const
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000

function subMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() - minutes * 60 * 1000)
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
}

export async function getCurrentMetrics(nodeId: string, windowMinutes = 360): Promise<NodeCurrentMetrics> {
  const since = subMinutes(new Date(), windowMinutes)

  const rows = await prisma.metricsRaw.findMany({
    where: { node_id: nodeId, collected_at: { gte: since } },
    orderBy: { collected_at: 'asc' },
  })

  if (rows.length === 0) {
    return { nodeId, cpu: 0, ram: 0, disk: 0, lastCollectedAt: '', isOnline: false, history: [] }
  }

  const latest = rows[rows.length - 1]
  const isOnline = Date.now() - latest.collected_at.getTime() < OFFLINE_THRESHOLD_MS

  const history = rows.map(r => ({
    timestamp: formatTime(r.collected_at),
    cpu: r.cpu_percent,
    ram: r.ram_percent,
    disk: r.disk_percent,
  }))

  return {
    nodeId,
    cpu: latest.cpu_percent,
    ram: latest.ram_percent,
    disk: latest.disk_percent,
    lastCollectedAt: latest.collected_at.toISOString(),
    isOnline,
    history,
  }
}

export async function getAllCurrentMetrics(windowMinutes = 360): Promise<NodeCurrentMetrics[]> {
  return Promise.all(NODES.map(nodeId => getCurrentMetrics(nodeId, windowMinutes)))
}

export async function getActiveReservations(): Promise<ActiveReservation[]> {
  const rows = await prisma.reservation.findMany({
    where: { status: 'active' },
    orderBy: { reserved_at: 'desc' },
  })

  return rows.map(r => ({
    id: r.id,
    nodeId: r.node_id,
    triggeredBy: r.triggered_by as 'automatic' | 'manual',
    cpuReserved: r.cpu_reserved,
    ramReservedGb: r.ram_reserved_gb,
    reservedAt: r.reserved_at.toISOString(),
    expiresAt: r.expires_at?.toISOString() ?? null,
    notes: r.notes,
  }))
}
