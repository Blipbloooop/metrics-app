// Mock Prisma avant tous les imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    metricsRaw: { findMany: jest.fn() },
    reservation: { findMany: jest.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getCurrentMetrics, getActiveReservations } from '@/lib/dashboard-data'

const mockMetrics = jest.mocked(prisma.metricsRaw.findMany)
const mockReservations = jest.mocked(prisma.reservation.findMany)

beforeEach(() => jest.clearAllMocks())

describe('getCurrentMetrics', () => {
  it('retourne un NodeCurrentMetrics par nœud avec history formatée', async () => {
    const now = new Date()
    const oneMinAgo = new Date(now.getTime() - 60_000)

    mockMetrics.mockResolvedValue([
      {
        id: '1', node_id: 'k8s-master',
        cpu_percent: 45.5, ram_percent: 62.1, disk_percent: 30.0,
        network_rx_mb: 1.2, network_tx_mb: 0.8,
        collected_at: oneMinAgo, created_at: oneMinAgo,
      },
      {
        id: '2', node_id: 'k8s-master',
        cpu_percent: 47.0, ram_percent: 63.0, disk_percent: 30.1,
        network_rx_mb: 1.3, network_tx_mb: 0.9,
        collected_at: now, created_at: now,
      },
    ] as never)

    const result = await getCurrentMetrics('k8s-master')

    expect(result.nodeId).toBe('k8s-master')
    expect(result.cpu).toBeCloseTo(47.0)
    expect(result.ram).toBeCloseTo(63.0)
    expect(result.isOnline).toBe(true)
    expect(result.history).toHaveLength(2)
    expect(result.history[0]).toHaveProperty('timestamp')
    expect(result.history[0]).toHaveProperty('cpu')
    expect(result.history[0]).toHaveProperty('ram')
  })

  it('marque isOnline false si dernière collecte > 2min', async () => {
    const threeMinAgo = new Date(Date.now() - 3 * 60_000)
    mockMetrics.mockResolvedValue([
      {
        id: '1', node_id: 'k8s-worker-2',
        cpu_percent: 20.0, ram_percent: 40.0, disk_percent: 20.0,
        network_rx_mb: 0, network_tx_mb: 0,
        collected_at: threeMinAgo, created_at: threeMinAgo,
      },
    ] as never)

    const result = await getCurrentMetrics('k8s-worker-2')
    expect(result.isOnline).toBe(false)
  })

  it('retourne des valeurs à zéro si aucune métrique', async () => {
    mockMetrics.mockResolvedValue([])
    const result = await getCurrentMetrics('k8s-worker-1')
    expect(result.cpu).toBe(0)
    expect(result.isOnline).toBe(false)
    expect(result.history).toHaveLength(0)
  })
})

describe('getActiveReservations', () => {
  it('retourne les réservations actives formatées', async () => {
    const now = new Date()
    mockReservations.mockResolvedValue([
      {
        id: 'res-1', node_id: 'k8s-worker-1',
        triggered_by: 'manual', status: 'active',
        cpu_reserved: 2.0, ram_reserved_gb: 4.0,
        reserved_at: now, expires_at: null,
        released_at: null, notes: 'Test', prediction_id: null,
      },
    ] as never)

    const result = await getActiveReservations()
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('k8s-worker-1')
    expect(result[0].cpuReserved).toBe(2.0)
    expect(result[0].triggeredBy).toBe('manual')
  })
})
