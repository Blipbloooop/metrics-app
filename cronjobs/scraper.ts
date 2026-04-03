/**
 * CronJob Kubernetes - Collecte métriques Prometheus → POST /api/metrics/ingest
 * Tourne toutes les minutes via un CronJob K8s
 * Réutilise les fonctions de prometheus-collector.ts
 */

import {
  getNodeCpuUsage,
  getNodeMemoryUsage,
  getNodeDiskIO,
  getNodeDiskUsage,
  getNodeNetworkIO,
} from '../app/services/prometheus-collector'

const INGEST_URL = process.env.INGEST_URL || 'http://localhost:3000'
const INGEST_TOKEN = process.env.METRICS_INGEST_TOKEN

// Capacités des nœuds — alignées avec le seed prisma/seed.ts
const NODE_CAPACITY: Record<string, { cpuCores: number; ramGb: number }> = {
  'k8s-master':   { cpuCores: 2, ramGb: 4 },
  'k8s-worker-1': { cpuCores: 4, ramGb: 8 },
  'k8s-worker-2': { cpuCores: 4, ramGb: 8 },
}

// Mapping IP Prometheus → node_id
// prometheus-collector retourne les clés sous forme "IP:9100"
const INSTANCE_TO_NODE: Record<string, string> = {
  '192.168.10.213:9100': 'k8s-master',
  '192.168.10.243:9100': 'k8s-worker-1',
  '192.168.10.126:9100': 'k8s-worker-2',
}

function resolveNodeId(instance: string): string | null {
  // Correspondance directe IP:port
  if (INSTANCE_TO_NODE[instance]) return INSTANCE_TO_NODE[instance]
  // Correspondance partielle (au cas où Prometheus retourne juste l'IP)
  for (const [key, nodeId] of Object.entries(INSTANCE_TO_NODE)) {
    if (instance.includes(key.split(':')[0])) return nodeId
  }
  return null
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(Math.max(value, min), max)
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

async function postMetrics(payload: object): Promise<void> {
  const res = await fetch(`${INGEST_URL}/api/metrics/ingest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${INGEST_TOKEN}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ingest HTTP ${res.status}: ${text}`)
  }
}

async function main() {
  console.log(`[scraper] Starting at ${new Date().toISOString()}`)
  console.log(`[scraper] PROMETHEUS_URL: ${process.env.PROMETHEUS_URL}`)
  console.log(`[scraper] INGEST_URL: ${process.env.INGEST_URL}`)

  if (!INGEST_TOKEN) {
    console.error('[scraper] METRICS_INGEST_TOKEN is not set')
    process.exit(1)
  }

  // Collecter toutes les métriques en parallèle
  const [cpuByNode, memByNode, diskByNode, diskUsageByNode, netByNode] = await Promise.all([
    getNodeCpuUsage(),
    getNodeMemoryUsage(),
    getNodeDiskIO(),
    getNodeDiskUsage(),
    getNodeNetworkIO(),
  ])

  console.log("[scrapper] cpuByNode:", cpuByNode)
  console.log("[scrapper] memByNode:", memByNode)


  const collectedAt = new Date().toISOString()
  const results: PromiseSettledResult<void>[] = []
  const nodeIds: string[] = []

  // Itérer sur les instances retournées par Prometheus (clé = "IP:9100")
  for (const instance of Object.keys(cpuByNode)) {
    const nodeId = resolveNodeId(instance)

    if (!nodeId) {
      console.warn(`[scraper] Unknown instance: ${instance}, skipping`)
      continue
    }

    const capacity = NODE_CAPACITY[nodeId]
    const cpuCores = cpuByNode[instance] ?? 0
    const ramMb    = memByNode[instance] ?? 0
    const disk     = diskByNode[instance]
    const net      = netByNode[instance]

    // Conversion valeurs absolues → pourcentages
    const cpu_percent  = clamp(round2((cpuCores / capacity.cpuCores) * 100))
    const ram_percent  = clamp(round2((ramMb / (capacity.ramGb * 1024)) * 100))

    const disk_percent = clamp(round2(diskUsageByNode[instance] ?? 0))

    const network_rx_mb = round2(net?.inMb ?? 0)
    const network_tx_mb = round2(net?.outMb ?? 0)

    const payload = {
      node_id:      nodeId,
      collected_at: collectedAt,
      cpu_percent,
      ram_percent,
      disk_percent,
      network_rx_mb,
      network_tx_mb,
    }

    console.log(`[scraper] Ingesting ${nodeId}:`, payload)

    nodeIds.push(nodeId)
    results.push(
      await Promise.allSettled([postMetrics(payload)]).then(r => r[0])
    )
  }

  // Rapport final
  let hasError = false
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      console.error(`[scraper] ERROR ${nodeIds[i]}: ${result.reason}`)
      hasError = true
    } else {
      console.log(`[scraper] OK ${nodeIds[i]}`)
    }
  })

  console.log(`[scraper] Done at ${new Date().toISOString()}`)

  // Exit 1 si erreur → K8s marque le Job comme failed
  if (hasError) process.exit(1)
}

main().catch((err) => {
  console.error('[scraper] Fatal error:', err)
  process.exit(1)
})