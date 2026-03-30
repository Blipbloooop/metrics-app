import { z } from 'zod'

export const ReserveRequestSchema = z.object({
  node_id: z.enum(['k8s-master', 'k8s-worker-1', 'k8s-worker-2']),
  namespace: z.string().min(1).max(63), // Kubernetes namespace naming rules
  deployment_name: z.string().min(1).max(63),
  replica_count: z.number().int().min(1).max(100),
  cpu_per_replica: z.number().min(0.1).max(32), // cores
  ram_per_replica: z.number().min(0.1).max(256), // Go
  duration_minutes: z.number().int().min(5).max(1440).default(60),
  reason: z.string().max(500).optional(),
})

export type ReserveRequest = z.infer<typeof ReserveRequestSchema>

export const ReserveResponseSchema = z.object({
  reservation_id: z.string(),
  node_id: z.string(),
  namespace: z.string(),
  deployment_name: z.string(),
  status: z.enum(['pending', 'active', 'failed']),
  cpu_reserved: z.number(),
  ram_reserved_gb: z.number(),
  details: z.object({
    resource_quota_created: z.boolean(),
    limit_range_created: z.boolean(),
    deployment_scaled: z.boolean(),
    expires_at: z.string().datetime(),
  }),
  error: z.string().optional(),
})

export type ReserveResponse = z.infer<typeof ReserveResponseSchema>
