import { z } from 'zod'

export const ReleaseRequestSchema = z.object({
  reservation_id: z.string().min(1),
  namespace: z.string().min(1).max(63),
  deployment_name: z.string().min(1).max(63),
})

export type ReleaseRequest = z.infer<typeof ReleaseRequestSchema>
