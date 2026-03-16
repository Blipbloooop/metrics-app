import { z } from 'zod'

export const ForecastRequestSchema = z.object({
  node_id: z.enum(['k8s-master', 'k8s-worker-1', 'k8s-worker-2']),
  horizon_minutes: z.number().int().min(5).max(120).default(30),
  step_minutes: z.number().int().min(1).max(30).default(5),
})

export type ForecastRequest = z.infer<typeof ForecastRequestSchema>
