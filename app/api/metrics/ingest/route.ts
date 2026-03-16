import { NextRequest, NextResponse } from 'next/server'
import { MetricsIngestSchema } from '@/lib/validators/metrics'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {

  // 1. Vérification du token
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.METRICS_INGEST_TOKEN

  if (!expectedToken) {
    console.error('[metrics/ingest] METRICS_INGEST_TOKEN not configured')
    return NextResponse.json(
      { error: 'Server misconfiguration' },
      { status: 500 }
    )
  }

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    console.warn('[metrics/ingest] Unauthorized attempt', {
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  // 2. Parsing du body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON' },
      { status: 400 }
    )
  }

  // 3. Validation Zod
  const parsed = MetricsIngestSchema.safeParse(body)
  if (!parsed.success) {
    console.warn('[metrics/ingest] Validation failed', {
      errors: parsed.error.flatten(),
      timestamp: new Date().toISOString(),
    })
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 }
    )
  }

  // 4. Vérifier que le node existe en DB
  const node = await prisma.node.findUnique({
    where: { id: parsed.data.node_id },
  })

  if (!node) {
    console.warn(`[metrics/ingest] Unknown node: ${parsed.data.node_id}`)
    return NextResponse.json(
      { error: `Node '${parsed.data.node_id}' not found in database` },
      { status: 404 }
    )
  }

  // 5. Écriture Prisma
  try {
    await prisma.metricsRaw.create({
      data: {
        node_id:       parsed.data.node_id,
        collected_at:  new Date(parsed.data.collected_at),
        cpu_percent:   parsed.data.cpu_percent,
        ram_percent:   parsed.data.ram_percent,
        disk_percent:  parsed.data.disk_percent,
        network_rx_mb: parsed.data.network_rx_mb,
        network_tx_mb: parsed.data.network_tx_mb,
      },
    })
  } catch (error) {
    console.error('[metrics/ingest] DB write failed', {
      error,
      node_id:      parsed.data.node_id,
      collected_at: parsed.data.collected_at,
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  // 6. Réponse succès
  return NextResponse.json(
    {
      status: 'ok',
      node_id:      parsed.data.node_id,
      collected_at: parsed.data.collected_at,
    },
    { status: 201 }
  )
}