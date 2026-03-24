import {
  PredictionServiceResponseSchema,
  type PredictionServiceResponse,
} from '@/lib/validators/predict-response'
import {
  ForecastServiceResponseSchema,
  type ForecastServiceResponse,
} from '@/lib/validators/forecast-response'

const PREDICTION_SERVICE_URL =
  process.env.PREDICTION_SERVICE_URL ??
  "http://prediction-service.ai-module.svc.cluster.local:3001";

export type { PredictionServiceResponse, ForecastServiceResponse }

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

    const json = await res.json();
    const parsed = PredictionServiceResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `prediction-service /predict: réponse invalide: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────
// Forecast : prédiction itérative multi-pas
// ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callForecastService(payload: Record<string, any>): Promise<ForecastServiceResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(`${PREDICTION_SERVICE_URL}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `prediction-service /forecast responded with status ${res.status}: ${text}`,
      );
    }

    const json = await res.json();
    const parsed = ForecastServiceResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `prediction-service /forecast: réponse invalide: ${parsed.error.message}`,
      );
    }
    return parsed.data;
>>>>>>> 317a9975fad950686f0205acb5e8fdbba70594dc
  } finally {
    clearTimeout(timeout);
  }
}
