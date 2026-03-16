const PREDICTION_SERVICE_URL =
  process.env.PREDICTION_SERVICE_URL ??
  "http://prediction-service.ai-module.svc.cluster.local:3001";

export interface PredictionServiceResponse {
  request_id: string;
  timestamp: string;
  prediction: {
    predicted_cpu_percent: number;
    predicted_ram_percent: number;
    predicted_disk_percent: number;
    overload_risk: number;
    confidence: number;
    recommendation: string;
  };
  model_info: {
    model_name: string;
    inference_time_ms: number;
    tokens_generated: number;
  };
}

export async function callPredictionService(
  payload: object,
): Promise<PredictionServiceResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(`${PREDICTION_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`prediction-service responded with status ${res.status}`);
    }

    return res.json() as Promise<PredictionServiceResponse>;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────
// Forecast : prédiction itérative multi-pas
// ─────────────────────────────────────────

export interface ForecastStep {
  step: number;
  timestamp: string;
  predicted_cpu_percent: number;
  predicted_ram_percent: number;
}

export interface ForecastServiceResponse {
  node: string;
  forecast: ForecastStep[];
  cpu_avg: number;
  cpu_peak: number;
  ram_avg: number;
  ram_peak: number;
  model_used: string;
  total_inference_time_ms: number;
}

export async function callForecastService(payload: {
  node: string;
  cpu_history: number[];
  ram_history: number[];
  horizon_minutes: number;
  step_minutes: number;
}): Promise<ForecastServiceResponse> {
  const controller = new AbortController();
  // Timeout plus long pour le forecast itératif (60s)
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(`${PREDICTION_SERVICE_URL}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        metrics: {
          node: payload.node,
          cpu_history: payload.cpu_history,
          ram_history: payload.ram_history,
        },
        horizon_minutes: payload.horizon_minutes,
        step_minutes: payload.step_minutes,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `prediction-service /forecast responded with status ${res.status}: ${text}`,
      );
    }

    return res.json() as Promise<ForecastServiceResponse>;
  } finally {
    clearTimeout(timeout);
  }
}
