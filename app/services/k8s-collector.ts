/**
 * Service de collecte des métriques Kubernetes
 * Utilise @kubernetes/client-node pour accéder à:
 * - metrics.k8s.io API (CPU/Memory via metrics-server)
 * - v1 core API (network, status, etc.)
 */

import * as k8s from "@kubernetes/client-node";
import {
  NodeMetric,
  PodMetric,
  ServiceMetric,
  CollectionError,
  CollectorConfig,
} from "@/app/types/metrics";
import { normalizeMetrics } from "@/utils/normalizer";
import { storeRawMetrics } from "@/app/services/metrics-storage";
import prisma from '@/lib/prisma';
import { enrichNodeMetricsFromPrometheus, enrichPodMetricsFromPrometheus } from "./prometheus-collector";

class K8sMetricsCollector {
  private kc: k8s.KubeConfig;
  private metricsClient: k8s.CustomObjectsApi;
  private coreApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private config: CollectorConfig;
  private collectionInterval: ReturnType<typeof setInterval> | null = null;
  private isCollecting = false;
  private errors: CollectionError[] = [];

  constructor(config: CollectorConfig) {
    this.config = config;
    this.kc = new k8s.KubeConfig();

    // Charger la configuration Kubernetes
    if (this.config.kubeConfigPath) {
      // Depuis un fichier kubeconfig (développement local)
      this.kc.loadFromFile(this.config.kubeConfigPath);
    } else {
      // Depuis les variables d'environnement du cluster (production)
      this.kc.loadFromCluster();
    }

    // Initialiser les clients API
    this.metricsClient = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
  }

  /**
   * Démarrer la collecte régulière des métriques
   */
  public async start(): Promise<void> {
    if (!this.config.enabled) {
      console.log("[K8sCollector] Collector disabled, not starting");
      return;
    }

    console.log(
      `[K8sCollector] Starting metrics collector (interval: ${this.config.interval}ms)`,
    );

    // Effectuer une collecte immédiate
    await this.collect();

    // Puis à intervalles réguliers
    this.collectionInterval = setInterval(async () => {
      try {
        await this.collect();
      } catch (error) {
        console.error("[K8sCollector] Collection failed:", error);
        this.recordError("unknown", undefined, error as Error);
      }
    }, this.config.interval);
  }

  /**
   * Arrêter la collecte
   */
  public stop(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = null;
      console.log("[K8sCollector] Metrics collector stopped");
    }
  }

  /**
   * Une itération de collecte complète
   */
  private async collect(): Promise<void> {
    if (this.isCollecting) {
      console.warn("[K8sCollector] Collection already in progress, skipping");
      return;
    }

    this.isCollecting = true;
    const startTime = Date.now();

    try {
      console.log(
        `[K8sCollector] Starting collection at ${new Date().toISOString()}`,
      );

      // Collecter les trois types d'entités
      const [nodeMetrics, podMetrics, serviceMetrics] = await Promise.all([
        this.collectNodeMetrics(),
        this.collectPodMetrics(),
        this.collectServiceMetrics(),
      ]);

      const enrichedNodes = process.env.PROMETHEUS_ENABLED === 'true' 
        ? await enrichNodeMetricsFromPrometheus(nodeMetrics)
        : nodeMetrics;

      const enrichedPods = process.env.PROMETHEUS_ENABLED === 'true'
        ? await enrichPodMetricsFromPrometheus(podMetrics)
        : podMetrics;

      // Stocker dans la base de données
      await storeRawMetrics({
        timestamp: new Date(),
        nodes: nodeMetrics,
        pods: podMetrics,
        services: serviceMetrics,
      });

      const duration = Date.now() - startTime;
      console.log(
        `[K8sCollector] Collection completed in ${duration}ms ` +
          `(nodes: ${nodeMetrics.length}, pods: ${podMetrics.length}, services: ${serviceMetrics.length})`,
      );
    } catch (error) {
      console.error("[K8sCollector] Collection error:", error);
      this.recordError("unknown", undefined, error as Error);
    } finally {
      this.isCollecting = false;
    }

  }

  /**
   * Collecter les métriques des nœuds
   */
  private async collectNodeMetrics(): Promise<NodeMetric[]> {
    const metrics: NodeMetric[] = [];

    try {
      // 1. Récupérer les métriques CPU/Mémoire depuis metrics.k8s.io
      let nodeMetricsData: any;
      try {
        nodeMetricsData = await this.metricsClient.listClusterCustomObject({
          group: "metrics.k8s.io",
          version: "v1beta1",
          plural: "nodes",
        });
      } catch (error) {
        console.warn(
          "[K8sCollector] Failed to get node metrics from metrics API:",
          error,
        );
        nodeMetricsData = { items: [] };
      }

      // 2. Récupérer les nœuds et leur status
      const nodesResponse = await this.coreApi.listNode();
      const nodes = nodesResponse.items;

      // 3. Créer une map des métriques CPU/Memory par node
      const metricsMap: Record<string, any> = {};
      if (nodeMetricsData.items) {
        for (const item of nodeMetricsData.items) {
          metricsMap[item.metadata.name] = item.usage;
        }
      }

      // 4. Traiter chaque nœud
      for (const node of nodes) {
        const nodeName = node.metadata!.name!;
        const usage = metricsMap[nodeName];

        // Déterminer le status
        let status: "Ready" | "NotReady" | "Unknown" = "Unknown";
        if (node.status?.conditions) {
          const readyCondition = node.status.conditions.find(
            (c: k8s.V1NodeCondition) => c.type === "Ready",
          );
          status = readyCondition?.status === "True" ? "Ready" : "NotReady";
        }

        // Capacity (ressources totales du nœud)
        const capacity = node.status?.capacity;
        const cpuCapacity = capacity?.cpu
          ? normalizeMetrics.cpu(capacity.cpu, "string")
          : undefined;
        const memoryCapacity = capacity?.memory
          ? normalizeMetrics.memory(capacity.memory, "string")
          : undefined;

        const nodeMetric: NodeMetric = {
          id: nodeName,
          timestamp: new Date(),
          cpuCores: usage ? normalizeMetrics.cpu(usage.cpu, "string") : 0,
          memoryMb: usage ? normalizeMetrics.memory(usage.memory, "string") : 0,
          networkInMb: 0, // Non disponible via metrics API
          networkOutMb: 0, // Non disponible via metrics API
          ioReadMb: 0, // Non disponible via metrics API
          ioWriteMb: 0, // Non disponible via metrics API
          status,
          capacity:
            cpuCapacity && memoryCapacity
              ? { cpuCores: cpuCapacity, memoryMb: memoryCapacity }
              : undefined,
        };

        metrics.push(nodeMetric);
      }
    } catch (error) {
      console.error("[K8sCollector] Error collecting node metrics:", error);
      this.recordError("node", undefined, error as Error);
    }

    return metrics;
  }

  /**
   * Collecter les métriques des pods
   */
  private async collectPodMetrics(): Promise<PodMetric[]> {
    const metrics: PodMetric[] = [];

    try {
      // Déterminer le(s) namespace(s) à scruter
      const namespaces =
        this.config.namespace === "*"
          ? (await this.coreApi.listNamespace()).items.map(
              (ns: k8s.V1Namespace) => ns.metadata!.name!,
            )
          : [this.config.namespace || "default"];

      // 1. Récupérer les métriques de pods
      let podMetricsData: any;
      try {
        // Récupérer les métriques pour tous les namespaces
        podMetricsData = await this.metricsClient.listCustomObjectForAllNamespaces({
          group: "metrics.k8s.io",
          version: "v1beta1",
          plural: "pods",
        });
      } catch (error) {
        console.warn(
          "[K8sCollector] Failed to get pod metrics from metrics API:",
          error,
        );
        podMetricsData = { items: [] };
      }

      // 2. Créer une map des métriques par pod (namespace/name)
      const metricsMap: Record<string, any> = {};
      if (podMetricsData.items) {
        for (const item of podMetricsData.items) {
          const ns = item.metadata.namespace;
          const name = item.metadata.name;
          const key = `${ns}/${name}`;

          // Agréger les containers
          let totalCpu = "0";
          let totalMemory = "0";

          if (item.containers) {
            let cpuSum = 0;
            let memorySum = 0;

            for (const container of item.containers) {
              if (container.usage) {
                cpuSum += normalizeMetrics.cpu(
                  container.usage.cpu || "0",
                  "string",
                );
                memorySum += normalizeMetrics.memory(
                  container.usage.memory || "0",
                  "string",
                );
              }
            }

            totalCpu = cpuSum.toString();
            totalMemory = memorySum.toString();
          }

          metricsMap[key] = { cpu: totalCpu, memory: totalMemory };
        }
      }

      // 3. Récupérer tous les pods des namespaces
      for (const namespace of namespaces) {
        try {
          const podsResponse = await this.coreApi.listNamespacedPod({ namespace });
          const pods = podsResponse.items;

          for (const pod of pods) {
            const namespace = pod.metadata!.namespace!;
            const podName = pod.metadata!.name!;
            const key = `${namespace}/${podName}`;
            const usage = metricsMap[key];

            // Déterminer le phase
            const phase = (pod.status?.phase || "Unknown") as
              | "Pending"
              | "Running"
              | "Succeeded"
              | "Failed"
              | "Unknown";

            // Compter les restarts
            let restartCount = 0;
            if (pod.status?.containerStatuses) {
              restartCount = pod.status.containerStatuses.reduce(
                (sum: number, cs: k8s.V1ContainerStatus) => sum + (cs.restartCount || 0),
                0,
              );
            }

            const podMetric: PodMetric = {
              id: key,
              namespace,
              podName,
              nodeName: pod.spec?.nodeName,
              timestamp: new Date(),
              cpuCores: usage ? parseFloat(usage.cpu) : 0,
              memoryMb: usage ? parseFloat(usage.memory) : 0,
              networkInMb: 0, // Non disponible via metrics API
              networkOutMb: 0, // Non disponible via metrics API
              ioReadMb: 0, // Non disponible via metrics API
              ioWriteMb: 0, // Non disponible via metrics API
              containerCount: pod.spec?.containers?.length || 0,
              restartCount,
              phase,
            };

            metrics.push(podMetric);
          }
        } catch (error) {
          console.error(
            `[K8sCollector] Error collecting pod metrics for namespace ${namespace}:`,
            error,
          );
          this.recordError("pod", undefined, error as Error);
        }
      }
    } catch (error) {
      console.error("[K8sCollector] Error collecting pod metrics:", error);
      this.recordError("pod", undefined, error as Error);
    }

    return metrics;
  }

  /**
   * Collecter les métriques des services
   * Calcul agrégé depuis les pods
   */
  private async collectServiceMetrics(): Promise<ServiceMetric[]> {
    const metrics: ServiceMetric[] = [];

    try {
      // Déterminer le(s) namespace(s) à scruter
      const namespaces =
        this.config.namespace === "*"
          ? (await this.coreApi.listNamespace()).items.map(
              (ns: k8s.V1Namespace) => ns.metadata!.name!,
            )
          : [this.config.namespace || "default"];

      // 1. Récupérer tous les pods avec leurs métriques
      const podMetrics = await this.collectPodMetrics();
      const podMetricsMap: Record<string, PodMetric> = {};
      for (const pm of podMetrics) {
        podMetricsMap[pm.id] = pm;
      }

      // 2. Pour chaque namespace, récupérer les services et agréger
      for (const namespace of namespaces) {
        try {
          const servicesResponse =
            await this.coreApi.listNamespacedService({ namespace });
          const services = servicesResponse.items;

          for (const service of services) {
            const serviceName = service.metadata!.name!;
            const serviceKey = `${namespace}/${serviceName}`;
            const selector = service.spec?.selector || {};

            // Trouver tous les pods qui correspondent au sélecteur du service
            const matchingPods = podMetrics.filter((pod) => {
              if (pod.namespace !== namespace) return false;

              const podLabels = podMetricsMap[pod.id]
                ? {} // TODO: récupérer les labels depuis le pod
                : {};

              // Vérifier si le pod correspond au sélecteur
              for (const [key, value] of Object.entries(selector)) {
                if (podLabels[key as keyof typeof podLabels] !== value) {
                  return false;
                }
              }

              return true;
            });

            // Agréger les métriques
            const aggregated: ServiceMetric = {
              id: serviceKey,
              namespace,
              serviceName,
              timestamp: new Date(),
              cpuCores: matchingPods.reduce((sum, p) => sum + p.cpuCores, 0),
              memoryMb: matchingPods.reduce((sum, p) => sum + p.memoryMb, 0),
              networkInMb: matchingPods.reduce(
                (sum, p) => sum + p.networkInMb,
                0,
              ),
              networkOutMb: matchingPods.reduce(
                (sum, p) => sum + p.networkOutMb,
                0,
              ),
              ioReadMb: matchingPods.reduce((sum, p) => sum + p.ioReadMb, 0),
              ioWriteMb: matchingPods.reduce((sum, p) => sum + p.ioWriteMb, 0),
              podCount: matchingPods.length,
              type: (service.spec?.type || "ClusterIP") as
                | "ClusterIP"
                | "NodePort"
                | "LoadBalancer"
                | "ExternalName",
            };

            metrics.push(aggregated);
          }
        } catch (error) {
          console.error(
            `[K8sCollector] Error collecting service metrics for namespace ${namespace}:`,
            error,
          );
          this.recordError("service", undefined, error as Error);
        }
      }
    } catch (error) {
      console.error("[K8sCollector] Error collecting service metrics:", error);
      this.recordError("service", undefined, error as Error);
    }

    return metrics;
  }

  /**
   * Enregistrer une erreur de collecte
   */
  private recordError(
    source: "node" | "pod" | "service" | "unknown",
    entityId: string | undefined,
    error: Error,
  ): void {
    const errorRecord: CollectionError = {
      timestamp: new Date(),
      source,
      entityId,
      error: error.message,
      stack: error.stack,
    };

    this.errors.push(errorRecord);

    // Garder seulement les 100 dernières erreurs en mémoire
    if (this.errors.length > 100) {
      this.errors.shift();
    }
  }

  /**
   * Obtenir les erreurs récentes
   */
  public getRecentErrors(limit: number = 10): CollectionError[] {
    return this.errors.slice(-limit);
  }
}

// Singleton du collector
let collectorInstance: K8sMetricsCollector | null = null;

/**
 * Obtenir ou créer l'instance du collector
 */
export function getCollector(config?: CollectorConfig): K8sMetricsCollector {
  if (!collectorInstance && config) {
    collectorInstance = new K8sMetricsCollector(config);
  }
  return collectorInstance!;
}

/**
 * Initialiser le collector au démarrage de l'application
 * À appeler dans un route handler ou un job
 */
export async function initializeCollector(): Promise<void> {
  const config: CollectorConfig = {
    interval: parseInt(process.env.KUBE_COLLECTOR_INTERVAL || "30000", 10),
    enabled: process.env.KUBE_COLLECTOR_ENABLED === "true",
    kubeConfigPath: process.env.KUBE_CONFIG_PATH || undefined,
    namespace: process.env.KUBE_NAMESPACE || "default",
  };

  const collector = getCollector(config);
  await collector.start();
}

export default K8sMetricsCollector;