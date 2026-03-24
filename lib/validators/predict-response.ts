import { z } from 'zod'

/**
 * Contrat API standardisé pour POST /api/predict (PRV-27)
 */

// Réponse attendue du prediction-service /predict
export const PredictionServiceResponseSchema = z.object({
  request_id: z.string(),
  timestamp: z.string(),
  prediction: z.object({
    predicted_cpu_percent: z.number().min(0).max(100),
    predicted_ram_percent: z.number().min(0).max(100),
    predicted_disk_percent: z.number().min(0).max(100),
    overload_risk: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    recommendation: z.string(),
  }),
  model_info: z.object({
    model_name: z.string(),
    inference_time_ms: z.number(),
    tokens_generated: z.number(),
  }),
})

export type PredictionServiceResponse = z.infer<typeof PredictionServiceResponseSchema>

// Format de sortie standardisé de POST /api/predict
export const PredictOutputSchema = z.object({
  prediction_id: z.string(),
  node_id: z.string(),
  predicted_at: z.coerce.date(),
  input: z.object({
    cpu: z.number(),
    ram: z.number(),
    disk: z.number(),
    trend: z.enum(['up', 'down', 'stable']),
    horizon_minutes: z.number(),
  }),
  prediction: z.object({
    predicted_cpu_percent: z.number(),
    predicted_ram_percent: z.number(),
    predicted_disk_percent: z.number(),
    overload_risk: z.number(),
    confidence: z.number(),
    recommendation: z.string(),
  }),
  model_info: z.object({
    model_name: z.string(),
    inference_time_ms: z.number(),
    tokens_generated: z.number(),
  }),
  context: z.object({
    last_metrics: z.array(z.unknown()),
    active_reservations: z.array(z.unknown()),
    recent_alerts: z.array(z.unknown()),
    prediction_history: z.array(z.unknown()),
  }),
})

export type PredictOutput = z.infer<typeof PredictOutputSchema>
