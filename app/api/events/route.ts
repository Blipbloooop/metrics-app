import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { syncAllNamespaces } from '@/app/services/kube-events'

function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  return token === process.env.METRICS_INGEST_TOKEN
}

// GET /api/events — lecture des événements K8s stockés en DB
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const namespace = searchParams.get('namespace') ?? undefined
  const type      = searchParams.get('type') ?? undefined        // "Normal" | "Warning"
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 500)

  const since = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const events = await prisma.kubeEvent.findMany({
    where: {
      ...(namespace ? { namespace } : {}),
      ...(type      ? { type }      : {}),
      last_time: { gte: since },
    },
    orderBy: { last_time: 'desc' },
    take: limit,
    select: {
      uid: true,
      namespace: true,
      type: true,
      reason: true,
      message: true,
      object_kind: true,
      object_name: true,
      count: true,
      first_time: true,
      last_time: true,
    },
  })

  const warnings = events.filter((e) => e.type === 'Warning').length

  return NextResponse.json({
    total: events.length,
    warnings,
    events: events.map((e) => ({
      ...e,
      first_time: e.first_time.toISOString(),
      last_time:  e.last_time.toISOString(),
    })),
  })
}

// POST /api/events — déclenche la synchronisation depuis K8s
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncAllNamespaces()
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[events] Fatal error:', message)
    return NextResponse.json({ error: 'Event sync failed', detail: message }, { status: 500 })
  }
}
