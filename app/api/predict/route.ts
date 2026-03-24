import { NextRequest, NextResponse } from 'next/server'
import { PredictRequestSchema } from '@/lib/validators/predict'
import { callPredictionService } from '@/lib/services/prediction-client'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  // 1. Parse + validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = PredictRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 422 }
    )
  }

  const input = parsed.data

  // 2. Vérifier que le node existe en DB
  const node = await prisma.node.findUnique({ where: { id: input.node_id } })
  if (!node) {
    return NextResponse.json({ error: `Node '${input.node_id}' not found` }, { status: 404 })
  }

  // 3. Enrichissement DB — en parallèle pour la perf
  const [lastMetrics, activeReservations, thresholds, predictionHistory] = await Promise.all([
    // Dernières métriques brutes du node (5 derniers points)
    prisma.metricsRaw.findMany({
      where: { node_id: input.node_id },
      orderBy: { collected_at: 'desc' },
      take: 5,
    }),

    // Réservations actives du node
    prisma.reservation.findMany({
      where: { node_id: input.node_id, status: 'active' },
      orderBy: { reserved_at: 'desc' },
    }),

    // Seuils configurés (thresholds)
    prisma.alert.findMany({
      where: { node_id: input.node_id },
      orderBy: { triggered_at: 'desc' },
      take: 10,
    }),

    // Historique des 10 dernières prédictions du node
    prisma.prediction.findMany({
      where: { node_id: input.node_id },
      orderBy: { predicted_at: 'desc' },
      take: 10,
    }),
  ])

  // 4. Appel au prediction-service (avec prompt template + options Ollama)
  let predictionResult
  try {
    predictionResult = await callPredictionService({
      metrics: {
        node: input.node_id,
        cpu_history: lastMetrics.map((m: { cpu_percent: number }) => m.cpu_percent),
        ram_history: lastMetrics.map((m: { ram_percent: number }) => m.ram_percent),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'prediction-service unavailable', detail: message },
      { status: 502 }
    )
  }

  const OVERLOAD_RISK_MAP: Record<string, number> = { low: 0.2, medium: 0.6, high: 1.0 }
  const overloadRiskFloat = OVERLOAD_RISK_MAP[predictionResult.overload_risk] ?? 0.2

  // 5. Sauvegarder la prédiction en DB
  const saved = await prisma.prediction.create({
    data: {
      node_id: input.node_id,
      predicted_at: new Date(),
      horizon_minutes: input.prediction_horizon_minutes,
      predicted_cpu: predictionResult.predicted_cpu_percent,
      predicted_ram: predictionResult.predicted_ram_percent,
      predicted_disk: input.current_disk_percent,
      overload_risk: overloadRiskFloat,
      confidence: 0.7,
      recommendation: predictionResult.recommendation,
      model_name: predictionResult.model_used,
      inference_time_ms: 0,
    },
  })

  // 6. Retourner JSON enrichi
  return NextResponse.json(
    {
      prediction_id: saved.id,
      node_id: input.node_id,
      predicted_at: saved.predicted_at,
      input: {
        cpu: input.current_cpu_percent,
        ram: input.current_ram_percent,
        disk: input.current_disk_percent,
        trend: input.trend_direction,
        horizon_minutes: input.prediction_horizon_minutes,
      },
      prediction: {
        predicted_cpu_percent: predictionResult.predicted_cpu_percent,
        predicted_ram_percent: predictionResult.predicted_ram_percent,
        predicted_disk_percent: input.current_disk_percent,
        overload_risk: overloadRiskFloat,
        confidence: 0.7,
        recommendation: predictionResult.recommendation,
      },
      model_info: {
        model_name: predictionResult.model_used,
        inference_time_ms: 0,
      },
      context: {
        last_metrics: lastMetrics,
        active_reservations: activeReservations,
        recent_alerts: thresholds,
        prediction_history: predictionHistory,
      },
    },
    { status: 201 }
  )
}