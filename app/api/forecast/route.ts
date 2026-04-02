import { NextRequest, NextResponse } from 'next/server'
import { ForecastRequestSchema } from '@/lib/validators/forecast'
import { callForecastService } from '@/lib/services/prediction-client'
import { buildForecastPayload } from '@/lib/config/ollama'
import { assessRisk } from '@/lib/services/risk-assessment'
import prisma from '@/lib/prisma'

export async function POST(req: NextRequest) {
  // 1. Parse + validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ForecastRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation error', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { node_id, horizon_minutes, step_minutes } = parsed.data

  // 2. Vérifier que le node existe en DB
  const node = await prisma.node.findUnique({ where: { id: node_id } })
  if (!node) {
    return NextResponse.json(
      { error: `Node '${node_id}' not found` },
      { status: 404 },
    )
  }

  // 3. Récupérer l'historique CPU/RAM depuis metrics_raw
  //    On prend les N derniers points pour alimenter le modèle
  const historySize = Math.max(horizon_minutes, 30) // au moins 30 points
  const rawMetrics = await prisma.metricsRaw.findMany({
    where: { node_id },
    orderBy: { collected_at: 'desc' },
    take: historySize,
  })

  if (rawMetrics.length === 0) {
    return NextResponse.json(
      { error: `No metrics found for node '${node_id}'` },
      { status: 404 },
    )
  }

  // Inverser pour avoir l'ordre chronologique (ancien → récent)
  rawMetrics.reverse()

  const cpu_history = rawMetrics.map((m: { cpu_percent: number }) => m.cpu_percent)
  const ram_history = rawMetrics.map((m: { ram_percent: number }) => m.ram_percent)

  // 4. Appel au prediction-service /forecast (avec prompt template + options Ollama)
  let forecastResult
  try {
    forecastResult = await callForecastService(
      buildForecastPayload({
        node: node_id,
        cpu_history,
        ram_history,
        horizon_minutes,
        step_minutes,
      }),
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json(
      { error: 'prediction-service /forecast unavailable', detail: message },
      { status: 502 },
    )
  }

  // 5. Évaluer le risque de surcharge (PRV-24)
  const riskAssessment = assessRisk(forecastResult.cpu_peak, forecastResult.ram_peak)

  // 6. Sauvegarder la prédiction globale en DB (résumé du forecast)
  const saved = await prisma.prediction.create({
    data: {
      node_id,
      predicted_at: new Date(),
      horizon_minutes,
      predicted_cpu: forecastResult.cpu_peak,
      predicted_ram: forecastResult.ram_peak,
      predicted_disk: 0,
      overload_risk: riskAssessment.score,
      confidence: rawMetrics.length >= 10 ? 0.8 : 0.5,
      recommendation: riskAssessment.recommendation,
      model_name: forecastResult.model_used,
      inference_time_ms: 0,
    },
  })

  // 6b. Créer une alerte si les seuils CPU/RAM sont dépassés (PRV-56)
  const CPU_WARNING = parseFloat(process.env.ALERT_CPU_WARNING ?? '70')
  const CPU_CRITICAL = parseFloat(process.env.ALERT_CPU_CRITICAL ?? '90')
  const RAM_WARNING = parseFloat(process.env.ALERT_RAM_WARNING ?? '75')
  const RAM_CRITICAL = parseFloat(process.env.ALERT_RAM_CRITICAL ?? '90')

  const cpuPeak = forecastResult.cpu_peak
  const ramPeak = forecastResult.ram_peak

  if (cpuPeak >= CPU_WARNING || ramPeak >= RAM_WARNING) {
    const severity = (cpuPeak >= CPU_CRITICAL || ramPeak >= RAM_CRITICAL) ? 'critical' : 'warning'
    await prisma.alert.create({
      data: {
        node_id,
        prediction_id: saved.id,
        type: 'overload_predicted',
        severity,
        message: `Surcharge prédite sur ${node_id} : CPU ${cpuPeak.toFixed(1)}% / RAM ${ramPeak.toFixed(1)}%`,
        threshold: severity === 'critical' ? Math.max(CPU_CRITICAL, RAM_CRITICAL) : Math.max(CPU_WARNING, RAM_WARNING),
        actual_value: Math.max(cpuPeak, ramPeak),
      },
    })
  }

  // 7. Retourner le forecast enrichi avec risk_assessment
  return NextResponse.json(
    {
      prediction_id: saved.id,
      node_id,
      horizon_minutes,
      step_minutes,
      forecast: forecastResult.forecast,
      summary: {
        cpu_avg: forecastResult.cpu_avg,
        cpu_peak: forecastResult.cpu_peak,
        ram_avg: forecastResult.ram_avg,
        ram_peak: forecastResult.ram_peak,
      },
      risk_assessment: riskAssessment,
      model_used: forecastResult.model_used,
      history: {
        points_used: rawMetrics.length,
        oldest: rawMetrics[0].collected_at,
        newest: rawMetrics[rawMetrics.length - 1].collected_at,
      },
    },
    { status: 201 },
  )
}
