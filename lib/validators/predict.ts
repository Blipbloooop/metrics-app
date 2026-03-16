import { z } from 'zod'

export const PredictRequestSchema = z.object({
  node_id: z.enum(['k8s-master', 'k8s-worker-1', 'k8s-worker-2']),
  current_cpu_percent: z.number().min(0).max(100),
  current_ram_percent: z.number().min(0).max(100),
  current_disk_percent: z.number().min(0).max(100),
  trend_direction: z.enum(['up', 'down', 'stable']),
  prediction_horizon_minutes: z.number().int().min(5).max(1440).default(60),
  scenario_description: z.string().max(500).optional(),
})

export type PredictRequest = z.infer<typeof PredictRequestSchema>