/**
 * Service de collecte des métriques via l'API Prometheus
 * Prometheus est hébergé sur la VM Master (ici)
 * 
 * Fournit les métriques I/O et réseau que l'API k8s ne donne pas : 
 * - node-exporter : CPU, RAM, Disk I/Object, network par noeud physique
 * - cAdvisor (via kubelet) : CPU, RAM, network par pod/container
 */

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://monitoring-kube-prometheus-prometheus.monitoring.svc:9090';

interface PrometheusQueryResult {
  status: string;
  data: {
    resultType: string;
    result: Array<{
      metric: Record<string, string>;
      value: [number, string]; // [timestamp, value]
    }>;
  };
}

/**
 * Exécuter une requête PromQL instantanée
 */
async function queryPrometheus(query: string): Promise<PrometheusQueryResult> {
   const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`;

   const response = await fetch(url, {
    method: "GET",
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000) // timeout de 10 secondes
   });

   if (!response.ok) {
    throw new Error(`Prometheus query failed: ${response.status} ${response.statusText}`);
   }

   return await response.json();
}

/**
 * Exécuter une requête PromQL sur une plage de temps
 */
async function queryPrometheusRange(
  query: string,
  start: Date,
  end: Date,
  step: string = '30s'
): Promise<any> {
  const url = `${PROMETHEUS_URL}/api/v1/query_range?` + 
    `query=${encodeURIComponent(query)}` +
    `&start${start.toISOString}` +
    `&end=${end.toISOString()}` +
    `&step=${step}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Prometheus range query failed: ${response.status}`);
  }

  return await response.json();
}

// ═══════════════════════════════════════════════════════════
// Métriques par NŒUD (via node-exporter)
// ═══════════════════════════════════════════════════════════

/**
 * CPU par nœud : taux d'utilisation moyen sur les 30 dernières secondes
 * Retourne un nombre entre 0 et N (N = nombre de cores)
 */
export async function getNodeCpuUsage(): Promise<Record<string, number>> {
  const result = await queryPrometheus(
    '(1 - avg by(instance) (rate(node_cpu_seconds_total{mode="idle"}[2m])))'
  );

  const cpuByNode: Record<string, number> = {};
  for (const item of result.data.result) {
    const instance = item.metric.instance || 'unknown';
    cpuByNode[instance] = parseFloat(item.value[1]);
  }
  return cpuByNode;
}

/**
 * RAM par nœud : utilisation en MB
 */
export async function getNodeMemoryUsage(): Promise<Record<string, number>> {
  const result = await queryPrometheus(
    '(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / 1024 / 1024'
  );

  const memByNode: Record<string, number> = {};
  for (const item of result.data.result) {
    const instance = item.metric.instance || 'unknown';
    memByNode[instance] = parseFloat(item.value[1]);
  }
  return memByNode;
}

/**
 * I/O disque par nœud : lecture et écriture en MB/s
 */
export async function getNodeDiskIO(): Promise<Record<string, { readMb: number; writeMb: number }>> {
  const [readResult, writeResult] = await Promise.all([
    queryPrometheus('rate(node_disk_read_bytes_total[30s]) / 1024 / 1024'),
    queryPrometheus('rate(node_disk_written_bytes_total[30s]) / 1024 / 1024'),
  ]);

  const ioByNode: Record<string, { readMb: number; writeMb: number }> = {};

  for (const item of readResult.data.result) {
    const instance = item.metric.instance || 'unknown';
    if (!ioByNode[instance]) ioByNode[instance] = { readMb: 0, writeMb: 0 };
    ioByNode[instance].readMb += parseFloat(item.value[1]);
  }

  for (const item of writeResult.data.result) {
    const instance = item.metric.instance || 'unknown';
    if (!ioByNode[instance]) ioByNode[instance] = { readMb: 0, writeMb: 0 };
    ioByNode[instance].writeMb += parseFloat(item.value[1]);
  }

  return ioByNode;
}

/**
 * Réseau par nœud : trafic entrant/sortant en MB/s
 */
export async function getNodeNetworkIO(): Promise<Record<string, { inMb: number; outMb: number }>> {
  const [rxResult, txResult] = await Promise.all([
    queryPrometheus('sum by(instance) (rate(node_network_receive_bytes_total{device!="lo"}[2m])) / 1024 / 1024'),
    queryPrometheus('sum by(instance) (rate(node_network_transmit_bytes_total{device!="lo"}[2m])) / 1024 / 1024'),
  ]);

  const netByNode: Record<string, { inMb: number; outMb: number }> = {};

  for (const item of rxResult.data.result) {
    const instance = item.metric.instance || 'unknown';
    if (!netByNode[instance]) netByNode[instance] = { inMb: 0, outMb: 0 };
    netByNode[instance].inMb = parseFloat(item.value[1]);
  }

  for (const item of txResult.data.result) {
    const instance = item.metric.instance || 'unknown';
    if (!netByNode[instance]) netByNode[instance] = { inMb: 0, outMb: 0 };
    netByNode[instance].outMb = parseFloat(item.value[1]);
  }

  return netByNode;
}

// ═══════════════════════════════════════════════════════════
// Métriques par POD (via cAdvisor / kubelet)
// ═══════════════════════════════════════════════════════════

/**
 * CPU par pod : utilisation en cores
 */
export async function getPodCpuUsage(): Promise<Record<string, number>> {
  const result = await queryPrometheus(
    'sum by(namespace, pod) (rate(container_cpu_usage_seconds_total{container!="POD", container!=""}[30s]))'
  );

  const cpuByPod: Record<string, number> = {};
  for (const item of result.data.result) {
    const key = `${item.metric.namespace}/${item.metric.pod}`;
    cpuByPod[key] = parseFloat(item.value[1]);
  }
  return cpuByPod;
}

/**
 * RAM par pod : utilisation en MB
 */
export async function getPodMemoryUsage(): Promise<Record<string, number>> {
  const result = await queryPrometheus(
    'sum by(namespace, pod) (container_memory_usage_bytes{container!="POD", container!=""}) / 1024 / 1024'
  );

  const memByPod: Record<string, number> = {};
  for (const item of result.data.result) {
    const key = `${item.metric.namespace}/${item.metric.pod}`;
    memByPod[key] = parseFloat(item.value[1]);
  }
  return memByPod;
}

/**
 * Réseau par pod : trafic en MB/s
 */
export async function getPodNetworkIO(): Promise<Record<string, { inMb: number; outMb: number }>> {
  const [rxResult, txResult] = await Promise.all([
    queryPrometheus('sum by(namespace, pod) (rate(container_network_receive_bytes_total[30s])) / 1024 / 1024'),
    queryPrometheus('sum by(namespace, pod) (rate(container_network_transmit_bytes_total[30s])) / 1024 / 1024'),
  ]);

  const netByPod: Record<string, { inMb: number; outMb: number }> = {};

  for (const item of rxResult.data.result) {
    const key = `${item.metric.namespace}/${item.metric.pod}`;
    if (!netByPod[key]) netByPod[key] = { inMb: 0, outMb: 0 };
    netByPod[key].inMb = parseFloat(item.value[1]);
  }

  for (const item of txResult.data.result) {
    const key = `${item.metric.namespace}/${item.metric.pod}`;
    if (!netByPod[key]) netByPod[key] = { inMb: 0, outMb: 0 };
    netByPod[key].outMb = parseFloat(item.value[1]);
  }

  return netByPod;
}

/**
 * I/O disque par pod : lecture/écriture en MB/s
 */
export async function getPodDiskIO(): Promise<Record<string, { readMb: number; writeMb: number }>> {
  const [readResult, writeResult] = await Promise.all([
    queryPrometheus('sum by(namespace, pod) (rate(container_fs_reads_bytes_total[30s])) / 1024 / 1024'),
    queryPrometheus('sum by(namespace, pod) (rate(container_fs_writes_bytes_total[30s])) / 1024 / 1024'),
  ]);

  const ioByPod: Record<string, { readMb: number; writeMb: number }> = {};

  for (const item of readResult.data.result) {
    const key = `${item.metric.namespace}/${item.metric.pod}`;
    if (!ioByPod[key]) ioByPod[key] = { readMb: 0, writeMb: 0 };
    ioByPod[key].readMb = parseFloat(item.value[1]);
  }

  for (const item of writeResult.data.result) {
    const key = `${item.metric.namespace}/${item.metric.pod}`;
    if (!ioByPod[key]) ioByPod[key] = { readMb: 0, writeMb: 0 };
    ioByPod[key].writeMb = parseFloat(item.value[1]);
  }

  return ioByPod;
}

// ═══════════════════════════════════════════════════════════
// Collecte combinée (enrichit les données du K8sMetricsCollector)
// ═══════════════════════════════════════════════════════════

/**
 * Enrichir les métriques de nœuds avec les données Prometheus
 * Complète les champs networkIn/Out et ioRead/Write que l'API k8s ne fournit pas
 */
export async function enrichNodeMetricsFromPrometheus(
  nodeMetrics: import('@/app/types/metrics').NodeMetric[]
): Promise<import('@/app/types/metrics').NodeMetric[]> {
  try {
    const [diskIO, networkIO] = await Promise.all([
      getNodeDiskIO(),
      getNodeNetworkIO(),
    ]);

    return nodeMetrics.map((node) => {
      // Matcher par nom de nœud (les instances Prometheus contiennent souvent IP:port)
      const matchingDisk = Object.entries(diskIO).find(([instance]) =>
        instance.includes(node.id) || node.id.includes(instance.split(':')[0])
      );
      const matchingNet = Object.entries(networkIO).find(([instance]) =>
        instance.includes(node.id) || node.id.includes(instance.split(':')[0])
      );

      return {
        ...node,
        ioReadMb: matchingDisk ? matchingDisk[1].readMb : node.ioReadMb,
        ioWriteMb: matchingDisk ? matchingDisk[1].writeMb : node.ioWriteMb,
        networkInMb: matchingNet ? matchingNet[1].inMb : node.networkInMb,
        networkOutMb: matchingNet ? matchingNet[1].outMb : node.networkOutMb,
      };
    });
  } catch (error) {
    console.warn('[PrometheusCollector] Failed to enrich node metrics:', error);
    return nodeMetrics; // Retourner les métriques non enrichies en cas d'erreur
  }
}

/**
 * Enrichir les métriques de pods avec les données Prometheus
 */
export async function enrichPodMetricsFromPrometheus(
  podMetrics: import('@/app/types/metrics').PodMetric[]
): Promise<import('@/app/types/metrics').PodMetric[]> {
  try {
    const [podNet, podDisk] = await Promise.all([
      getPodNetworkIO(),
      getPodDiskIO(),
    ]);

    return podMetrics.map((pod) => {
      const net = podNet[pod.id];
      const disk = podDisk[pod.id];

      return {
        ...pod,
        networkInMb: net ? net.inMb : pod.networkInMb,
        networkOutMb: net ? net.outMb : pod.networkOutMb,
        ioReadMb: disk ? disk.readMb : pod.ioReadMb,
        ioWriteMb: disk ? disk.writeMb : pod.ioWriteMb,
      };
    });
  } catch (error) {
    console.warn('[PrometheusCollector] Failed to enrich pod metrics:', error);
    return podMetrics;
  }
}