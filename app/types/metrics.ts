/**
 * Types pour les métriques Kubernetes
 * Collectées depuis metrics.k8s.io et l'API core
 */

/**
 * Unité brute des métriques provenant de l'API Kubernetes
 * - CPU: nanocores (1 core = 1e9 nanocores)
 * - Memory: bytes
 * - Network: bytes
 * - I/O: bytes
 */
export interface RawMetricValue {
  nanocores?: string; // CPU
  memory?: string; // RAM
  networkIn?: string; // Network
  networkOut?: string; // Network
  ioRead?: string; // I/O
  ioWrite?: string; // I/O
}

/**
 * Métrique collectée d'un nœud Kubernetes
 */
export interface NodeMetric {
  id: string; // Node name from k8s
  timestamp: Date;
  cpuCores: number; // Normalized: cores (float)
  memoryMb: number; // Normalized: MB
  networkInMb: number; // Normalized: MB
  networkOutMb: number; // Normalized: MB
  ioReadMb: number; // Normalized: MB
  ioWriteMb: number; // Normalized: MB
  status: "Ready" | "NotReady" | "Unknown";
  capacity?: {
    cpuCores: number;
    memoryMb: number;
  };
}

/**
 * Métrique collectée d'une pod Kubernetes
 */
export interface PodMetric {
  id: string; // `namespace/pod-name`
  namespace: string;
  podName: string;
  nodeName?: string; // Sur quel node elle tourne
  timestamp: Date;
  cpuCores: number; // Normalized: cores (float)
  memoryMb: number; // Normalized: MB
  networkInMb: number; // Normalized: MB
  networkOutMb: number; // Normalized: MB
  ioReadMb: number; // Normalized: MB
  ioWriteMb: number; // Normalized: MB
  containerCount: number;
  restartCount: number;
  phase: "Pending" | "Running" | "Succeeded" | "Failed" | "Unknown";
}

/**
 * Métrique collectée d'un service Kubernetes
 * Agrégation des pods sous le service
 */
export interface ServiceMetric {
  id: string; // `namespace/service-name`
  namespace: string;
  serviceName: string;
  timestamp: Date;
  cpuCores: number; // Sum of all pods
  memoryMb: number; // Sum of all pods
  networkInMb: number; // Sum of all pods
  networkOutMb: number; // Sum of all pods
  ioReadMb: number; // Sum of all pods
  ioWriteMb: number; // Sum of all pods
  podCount: number;
  type: "ClusterIP" | "NodePort" | "LoadBalancer" | "ExternalName";
}

/**
 * Métrique agrégée par fenêtre de temps
 * Calculée par le job d'agrégation
 */
export interface AggregatedMetric {
  entityId: string; // node/pod/service ID
  entityType: "node" | "pod" | "service";
  window: "5min" | "1h" | "1d";
  startTime: Date;
  endTime: Date;
  metrics: {
    cpu: StatisticalMetric;
    memory: StatisticalMetric;
    networkIn: StatisticalMetric;
    networkOut: StatisticalMetric;
    ioRead: StatisticalMetric;
    ioWrite: StatisticalMetric;
  };
}

/**
 * Statistiques sur une métrique (avg, min, max, p95, stddev)
 */
export interface StatisticalMetric {
  avg: number;
  min: number;
  max: number;
  p95: number;
  stddev: number;
  sampleCount: number;
}

/**
 * Configuration du collector
 */
export interface CollectorConfig {
  interval: number; // millisecondes entre chaque collecte
  enabled: boolean;
  kubeConfigPath?: string; // chemin vers kubeconfig, '' pour in-cluster
  namespace?: string; // '*' pour tous, sinon namespace spécifique
}

/**
 * Erreur de collecte
 */
export interface CollectionError {
  timestamp: Date;
  source: "node" | "pod" | "service" | "unknown";
  entityId?: string;
  error: string;
  stack?: string;
}