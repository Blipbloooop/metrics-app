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

<<<<<<< HEAD
// Format retourné par le service réel
interface PredictionServiceRawResponse {
  node: string;
  predicted_cpu_percent: number;
  predicted_ram_percent: number;
  predicted_disk_percent?: number;
  overload_risk: string | number;
  confidence?: number;
  recommendation: string;
  model_used: string;
  inference_time_ms?: number;
  tokens_generated?: number;
  timestamp: string;
}

// Format standardisé qu'on retourne
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
=======
export type { PredictionServiceResponse, ForecastServiceResponse }
>>>>>>> 317a9975fad950686f0205acb5e8fdbba70594dc

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

<<<<<<< HEAD
    const rawResponse = (await res.json()) as PredictionServiceRawResponse;

    // Normalise la réponse du service vers notre format standardisé
    return {
      request_id: `req-${Date.now()}`,
      timestamp: rawResponse.timestamp,
      prediction: {
        predicted_cpu_percent: rawResponse.predicted_cpu_percent,
        predicted_ram_percent: rawResponse.predicted_ram_percent,
        predicted_disk_percent: rawResponse.predicted_disk_percent ?? 0,
        overload_risk: typeof rawResponse.overload_risk === 'string' 
          ? (rawResponse.overload_risk === 'high' ? 0.8 : rawResponse.overload_risk === 'medium' ? 0.5 : 0.2)
          : rawResponse.overload_risk,
        confidence: rawResponse.confidence ?? 0.5,
        recommendation: rawResponse.recommendation,
      },
      model_info: {
        model_name: rawResponse.model_used,
        inference_time_ms: rawResponse.inference_time_ms ?? 0,
        tokens_generated: rawResponse.tokens_generated ?? 0,
      },
    };
=======
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
