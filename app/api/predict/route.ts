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

  // 4. Appel au prediction-service
  let predictionResult
  try {
    predictionResult = await callPredictionService({
      current_cpu_percent: input.current_cpu_percent,
      current_ram_percent: input.current_ram_percent,
      current_disk_percent: input.current_disk_percent,
      trend_direction: input.trend_direction,
      prediction_horizon_minutes: input.prediction_horizon_minutes,
      scenario_description: input.scenario_description,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'prediction-service unavailable', detail: message },
      { status: 502 }
    )
  }

  const { prediction, model_info } = predictionResult

  // 5. Sauvegarder la prédiction en DB
  const saved = await prisma.prediction.create({
    data: {
      node_id: input.node_id,
      predicted_at: new Date(),
      horizon_minutes: input.prediction_horizon_minutes,
      predicted_cpu: prediction.predicted_cpu_percent,
      predicted_ram: prediction.predicted_ram_percent,
      predicted_disk: prediction.predicted_disk_percent,
      overload_risk: prediction.overload_risk,
      confidence: prediction.confidence,
      recommendation: prediction.recommendation,
      model_name: model_info.model_name,
      inference_time_ms: model_info.inference_time_ms,
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
        predicted_cpu_percent: prediction.predicted_cpu_percent,
        predicted_ram_percent: prediction.predicted_ram_percent,
        predicted_disk_percent: prediction.predicted_disk_percent,
        overload_risk: prediction.overload_risk,
        confidence: prediction.confidence,
        recommendation: prediction.recommendation,
      },
      model_info,
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