import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { runAutoRelease } from '@/app/services/auto-release'

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token === process.env.METRICS_INGEST_TOKEN
}

// GET /api/auto-release — état des réservations (sans déclencher)
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const since5min = new Date(now.getTime() - 5 * 60 * 1000)

  const [active, expiredSoon, recentlyReleased, queued] = await Promise.all([
    prisma.reservation.findMany({
      where: { status: 'active' },
      select: {
        id: true,
        node_id: true,
        namespace: true,
        deployment_name: true,
        triggered_by: true,
        cpu_reserved: true,
        ram_reserved_gb: true,
        reserved_at: true,
        expires_at: true,
      },
      orderBy: { reserved_at: 'desc' },
    }),
    // Réservations qui expirent dans les 10 prochaines minutes
    prisma.reservation.findMany({
      where: {
        status: 'active',
        expires_at: { lte: new Date(now.getTime() + 10 * 60 * 1000) },
      },
      select: { id: true, node_id: true, expires_at: true },
    }),
    // Relâchées dans les 5 dernières minutes
    prisma.reservation.findMany({
      where: { status: 'released', released_at: { gte: since5min } },
      select: { id: true, node_id: true, released_at: true, release_reason: true },
      orderBy: { released_at: 'desc' },
    }),
    // File d'attente
    prisma.reservation.findMany({
      where: { status: 'queued' },
      select: { id: true, node_id: true, triggered_by: true, cpu_reserved: true, ram_reserved_gb: true, reserved_at: true, expires_at: true },
      orderBy: [{ triggered_by: 'desc' }, { reserved_at: 'asc' }],
    }),
  ])

  const now_ts = now.getTime()
  const activeWithTTL = active.map((r) => ({
    ...r,
    expires_at: r.expires_at?.toISOString() ?? null,
    reserved_at: r.reserved_at.toISOString(),
    ttl_seconds: r.expires_at ? Math.round((r.expires_at.getTime() - now_ts) / 1000) : null,
  }))

  return NextResponse.json({
    active_count: active.length,
    queued_count: queued.length,
    active: activeWithTTL,
    queued: queued.map((r) => ({
      id: r.id,
      node_id: r.node_id,
      triggered_by: r.triggered_by,
      cpu_reserved: r.cpu_reserved,
      ram_reserved_gb: r.ram_reserved_gb,
      reserved_at: r.reserved_at.toISOString(),
      expires_at: r.expires_at?.toISOString() ?? null,
    })),
    expiring_soon: expiredSoon.map((r) => ({
      id: r.id,
      node_id: r.node_id,
      expires_at: r.expires_at?.toISOString(),
    })),
    recently_released: recentlyReleased.map((r) => ({
      id: r.id,
      node_id: r.node_id,
      released_at: r.released_at?.toISOString(),
      reason: r.release_reason,
    })),
  })
}

// POST /api/auto-release — déclenche le cycle de détection et relâchement
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runAutoRelease()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[auto-release] Fatal error:', message)
    return NextResponse.json({ error: 'Auto-release failed', detail: message }, { status: 500 })
  }
}
