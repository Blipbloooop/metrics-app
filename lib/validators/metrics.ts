import { z } from "zod";

export const MetricsIngestSchema = z.object({
  node_id: z.enum(['k8s-master', 'k8s-worker-1', 'k8s-worker-2']),
  collected_at: z.string().datetime(),
  cpu_percent: z.number().min(0).max(100),
  ram_percent: z.number().min(0).max(100),
  disk_percent: z.number().min(0).max(100),
  network_rx_mb: z.number().nonnegative(),
  network_tx_mb: z.number().nonnegative(),
})

export type MetricsIngestPayload = z.infer<typeof MetricsIngestSchema>