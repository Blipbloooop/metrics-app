import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { runCleanup } from '@/app/services/cleanup'

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token === process.env.METRICS_INGEST_TOKEN
}

// GET /api/cleanup — statistiques des données à nettoyer
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [oldReleased, oldFailed] = await Promise.all([
    prisma.reservation.count({
      where: { status: 'released', released_at: { lte: cutoff24h } },
    }),
    prisma.reservation.count({
      where: { status: 'failed', reserved_at: { lte: cutoff24h } },
    }),
  ])

  return NextResponse.json({
    purgeable_reservations: oldReleased + oldFailed,
    breakdown: { released: oldReleased, failed: oldFailed },
    cutoff: cutoff24h.toISOString(),
  })
}

// POST /api/cleanup — déclenche le cycle de nettoyage
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runCleanup()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[cleanup] Fatal error:', message)
    return NextResponse.json({ error: 'Cleanup failed', detail: message }, { status: 500 })
  }
}
