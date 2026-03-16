/**
 * Service de stockage des métriques brutes dans PostgreSQL
 * Avec indexation appropriée pour les requêtes time-series
 */

import prisma from '@/lib/prisma';
import { NodeMetric, PodMetric, ServiceMetric } from '@/app/types/metrics';

export interface RawMetricsInput {
  timestamp: Date;
  nodes: NodeMetric[];
  pods: PodMetric[];
  services: ServiceMetric[];
}

/**
 * Stocker un lot de métriques brutes
 * Utilise les transactions Prisma pour l'atomicité
 */
export async function storeRawMetrics(input: RawMetricsInput): Promise<void> {
  const { timestamp, nodes, pods, services } = input;

  try {
    await prisma.$transaction(async (tx) => {
      // Stocker les métriques de nœuds
      for (const nodeMetric of nodes) {
        await tx.nodeMetricRaw.create({
          data: {
            nodeId: nodeMetric.id,
            timestamp,
            cpuCores: nodeMetric.cpuCores,
            memoryMb: nodeMetric.memoryMb,
            networkInMb: nodeMetric.networkInMb,
            networkOutMb: nodeMetric.networkOutMb,
            ioReadMb: nodeMetric.ioReadMb,
            ioWriteMb: nodeMetric.ioWriteMb,
            status: nodeMetric.status,
            capacityCpuCores: nodeMetric.capacity?.cpuCores || null,
            capacityMemoryMb: nodeMetric.capacity?.memoryMb || null,
          },
        });
      }

      // Stocker les métriques de pods
      for (const podMetric of pods) {
        await tx.podMetricRaw.create({
          data: {
            podId: podMetric.id,
            namespace: podMetric.namespace,
            podName: podMetric.podName,
            nodeName: podMetric.nodeName || null,
            timestamp,
            cpuCores: podMetric.cpuCores,
            memoryMb: podMetric.memoryMb,
            networkInMb: podMetric.networkInMb,
            networkOutMb: podMetric.networkOutMb,
            ioReadMb: podMetric.ioReadMb,
            ioWriteMb: podMetric.ioWriteMb,
            containerCount: podMetric.containerCount,
            restartCount: podMetric.restartCount,
            phase: podMetric.phase,
          },
        });
      }

      // Stocker les métriques de services
      for (const serviceMetric of services) {
        await tx.serviceMetricRaw.create({
          data: {
            serviceId: serviceMetric.id,
            namespace: serviceMetric.namespace,
            serviceName: serviceMetric.serviceName,
            timestamp,
            cpuCores: serviceMetric.cpuCores,
            memoryMb: serviceMetric.memoryMb,
            networkInMb: serviceMetric.networkInMb,
            networkOutMb: serviceMetric.networkOutMb,
            ioReadMb: serviceMetric.ioReadMb,
            ioWriteMb: serviceMetric.ioWriteMb,
            podCount: serviceMetric.podCount,
            type: serviceMetric.type,
          },
        });
      }
    });

    console.log(
      `[MetricsStorage] Stored ${nodes.length} node, ` +
      `${pods.length} pod, ${services.length} service metrics at ${timestamp.toISOString()}`
    );
  } catch (error) {
    console.error('[MetricsStorage] Error storing metrics:', error);
    throw error;
  }
}

/**
 * Récupérer les métriques brutes pour une entité sur une plage de temps
 */
export async function getRawMetrics(
  entityType: 'node' | 'pod' | 'service',
  entityId: string,
  startTime: Date,
  endTime: Date
): Promise<any[]> {
  switch (entityType) {
    case 'node':
      return await prisma.nodeMetricRaw.findMany({
        where: {
          nodeId: entityId,
          timestamp: {
            gte: startTime,
            lte: endTime,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

    case 'pod':
      return await prisma.podMetricRaw.findMany({
        where: {
          podId: entityId,
          timestamp: {
            gte: startTime,
            lte: endTime,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

    case 'service':
      return await prisma.serviceMetricRaw.findMany({
        where: {
          serviceId: entityId,
          timestamp: {
            gte: startTime,
            lte: endTime,
          },
        },
        orderBy: { timestamp: 'asc' },
      });

    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }
}

/**
 * Récupérer les métriques brutes par namespace
 * Utile pour les dashboards
 */
export async function getRawMetricsByNamespace(
  namespace: string,
  entityType: 'pod' | 'service',
  startTime: Date,
  endTime: Date
): Promise<any[]> {
  if (entityType === 'pod') {
    return await prisma.podMetricRaw.findMany({
      where: {
        namespace,
        timestamp: {
          gte: startTime,
          lte: endTime,
        },
      },
      orderBy: { timestamp: 'asc' },
    });
  }

  return await prisma.serviceMetricRaw.findMany({
    where: {
      namespace,
      timestamp: {
        gte: startTime,
        lte: endTime,
      },
    },
    orderBy: { timestamp: 'asc' },
  });
}

/**
 * Compter le nombre de points de mesure (pour monitoring)
 */
export async function getMetricsCount(): Promise<{
  nodes: number;
  pods: number;
  services: number;
}> {
  const [nodeCount, podCount, serviceCount] = await Promise.all([
    prisma.nodeMetricRaw.count(),
    prisma.podMetricRaw.count(),
    prisma.serviceMetricRaw.count(),
  ]);

  return { nodes: nodeCount, pods: podCount, services: serviceCount };
}