const PREDICTION_SERVICE_URL =
  process.env.PREDICTION_SERVICE_URL ?? 'http://prediction-service.ai-module:3001'

export interface PredictionServiceResponse {
  request_id: string
  timestamp: string
  prediction: {
    predicted_cpu_percent: number
    predicted_ram_percent: number
    predicted_disk_percent: number
    overload_risk: number
    confidence: number
    recommendation: string
  }
  model_info: {
    model_name: string
    inference_time_ms: number
    tokens_generated: number
  }
}

export async function callPredictionService(
  payload: object
): Promise<PredictionServiceResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(`${PREDICTION_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`prediction-service responded with status ${res.status}`)
    }

    return res.json() as Promise<PredictionServiceResponse>
  } finally {
    clearTimeout(timeout)
  }
}