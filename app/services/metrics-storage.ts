/**
 * Service de stockage des métriques brutes dans PostgreSQL
 * Utilise le modèle MetricsRaw (table metrics_raw) du schema Prisma
 */

import prisma from '@/lib/prisma';
import { NodeMetric } from '@/app/types/metrics';

export interface RawMetricsInput {
  timestamp: Date;
  nodes: NodeMetric[];
}

/**
 * Stocker un lot de métriques brutes de nœuds
 * Utilise les transactions Prisma pour l'atomicité
 */
export async function storeRawMetrics(input: RawMetricsInput): Promise<void> {
  const { timestamp, nodes } = input;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.$transaction(async (tx: any) => {
      for (const nodeMetric of nodes) {
        const capacity = nodeMetric.capacity;
        const cpuPercent = capacity
          ? (nodeMetric.cpuCores / capacity.cpuCores) * 100
          : 0;
        const ramPercent = capacity
          ? (nodeMetric.memoryMb / capacity.memoryMb) * 100
          : 0;

        await tx.metricsRaw.create({
          data: {
            node_id: nodeMetric.id,
            collected_at: timestamp,
            cpu_percent: cpuPercent,
            ram_percent: ramPercent,
            disk_percent: 0, // disk non dispo via metrics API k8s
            network_rx_mb: nodeMetric.networkInMb,
            network_tx_mb: nodeMetric.networkOutMb,
          },
        });
      }
    });

    console.log(
      `[MetricsStorage] Stored ${nodes.length} node metrics at ${timestamp.toISOString()}`
    );
  } catch (error) {
    console.error('[MetricsStorage] Error storing metrics:', error);
    throw error;
  }
}

/**
 * Récupérer les métriques brutes d'un nœud sur une plage de temps
 */
export async function getRawMetrics(
  nodeId: string,
  startTime: Date,
  endTime: Date
) {
  return prisma.metricsRaw.findMany({
    where: {
      node_id: nodeId,
      collected_at: {
        gte: startTime,
        lte: endTime,
      },
    },
    orderBy: { collected_at: 'asc' },
  });
}

/**
 * Compter le nombre de points de mesure (pour monitoring)
 */
export async function getMetricsCount(): Promise<number> {
  return prisma.metricsRaw.count();
}
