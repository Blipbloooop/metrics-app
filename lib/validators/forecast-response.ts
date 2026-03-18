import { z } from 'zod'

/**
 * Contrat API standardisé pour POST /api/forecast (PRV-27)
 */

// Un pas de prédiction dans le forecast
export const ForecastStepSchema = z.object({
  t: z.string(),
  cpu_percent: z.number().min(0).max(100),
  ram_percent: z.number().min(0).max(100),
})

// Réponse attendue du prediction-service /forecast
export const ForecastServiceResponseSchema = z.object({
  node: z.string(),
  forecast: z.array(ForecastStepSchema).min(1),
  cpu_avg: z.number().min(0).max(100),
  cpu_peak: z.number().min(0).max(100),
  ram_avg: z.number().min(0).max(100),
  ram_peak: z.number().min(0).max(100),
  model_used: z.string(),
  timestamp: z.string(),
})

export type ForecastServiceResponse = z.infer<typeof ForecastServiceResponseSchema>

// Évaluation du risque
export const RiskAssessmentSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()),
  thresholds: z.object({
    cpu_medium: z.number(),
    cpu_high: z.number(),
    ram_medium: z.number(),
    ram_high: z.number(),
  }),
  recommendation: z.string(),
})

// Format de sortie standardisé de POST /api/forecast
export const ForecastOutputSchema = z.object({
  prediction_id: z.string(),
  node_id: z.string(),
  horizon_minutes: z.number(),
  step_minutes: z.number(),
  forecast: z.array(ForecastStepSchema),
  summary: z.object({
    cpu_avg: z.number(),
    cpu_peak: z.number(),
    ram_avg: z.number(),
    ram_peak: z.number(),
  }),
  risk_assessment: RiskAssessmentSchema,
  model_used: z.string(),
  history: z.object({
    points_used: z.number(),
    oldest: z.coerce.date(),
    newest: z.coerce.date(),
  }),
})

export type ForecastOutput = z.infer<typeof ForecastOutputSchema>
