/**
 * CronJob Kubernetes - Agrégation des métriques brutes
 * Calcule avg, min, max, p95 par fenêtre (5min, 15min, 1h)
 * Nettoie les données brutes > 7 jours
 * Tourne toutes les 5 minutes via CronJob K8s
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// Définition des fenêtres d'agrégation
const WINDOWS = [
  { name: '5min',  minutes: 5  },
  { name: '15min', minutes: 15 },
  { name: '1h',    minutes: 60 },
] as const

type WindowName = typeof WINDOWS[number]['name']

const NODE_IDS = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']

/**
 * Calculer et insérer les agrégats pour un nœud, une fenêtre et une période donnée.
 * Tout le calcul se fait en PostgreSQL via percentile_cont et les fonctions d'agrégation.
 * On évite un INSERT si la fenêtre est déjà agrégée (upsert sur node_id + window + window_start).
 */
async function aggregateWindow(
  nodeId: string,
  windowName: WindowName,
  windowMinutes: number,
  windowStart: Date,
  windowEnd: Date
): Promise<boolean> {

  // Requête SQL brute pour bénéficier de percentile_cont (non disponible via Prisma ORM)
  const result = await prisma.$queryRaw<Array<{
    avg_cpu:         number
    min_cpu:         number
    max_cpu:         number
    p95_cpu:         number
    avg_ram:         number
    min_ram:         number
    max_ram:         number
    p95_ram:         number
    avg_disk:        number
    min_disk:        number
    max_disk:        number
    avg_network_rx:  number
    avg_network_tx:  number
    sample_count:    bigint
  }>>`
    SELECT
      AVG(cpu_percent)                                          AS avg_cpu,
      MIN(cpu_percent)                                          AS min_cpu,
      MAX(cpu_percent)                                          AS max_cpu,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cpu_percent) AS p95_cpu,
      AVG(ram_percent)                                          AS avg_ram,
      MIN(ram_percent)                                          AS min_ram,
      MAX(ram_percent)                                          AS max_ram,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ram_percent) AS p95_ram,
      AVG(disk_percent)                                         AS avg_disk,
      MIN(disk_percent)                                         AS min_disk,
      MAX(disk_percent)                                         AS max_disk,
      AVG(network_rx_mb)                                        AS avg_network_rx,
      AVG(network_tx_mb)                                        AS avg_network_tx,
      COUNT(*)                                                  AS sample_count
    FROM metrics_raw
    WHERE node_id     = ${nodeId}
      AND collected_at >= ${windowStart}
      AND collected_at <  ${windowEnd}
  `

  // Pas de données pour cette fenêtre → skip silencieux
  if (!result.length || Number(result[0].sample_count) === 0) {
    return false
  }

  const r = result[0]

  // Upsert — si la fenêtre est déjà agrégée on écrase (idempotent)
  await prisma.$executeRaw`
    INSERT INTO metrics_aggregated (
      id, node_id, "window", window_start, window_end,
      cpu_avg, cpu_min, cpu_max, cpu_p95,
      ram_avg, ram_min, ram_max, ram_p95,
      disk_avg, disk_min, disk_max,
      network_rx_avg, network_tx_avg,
      sample_count, created_at
    ) VALUES (
      gen_random_uuid(), ${nodeId}, ${windowName}, ${windowStart}, ${windowEnd},
      ${Number(r.avg_cpu)},  ${Number(r.min_cpu)},  ${Number(r.max_cpu)},  ${Number(r.p95_cpu)},
      ${Number(r.avg_ram)},  ${Number(r.min_ram)},  ${Number(r.max_ram)},  ${Number(r.p95_ram)},
      ${Number(r.avg_disk)}, ${Number(r.min_disk)}, ${Number(r.max_disk)},
      ${Number(r.avg_network_rx)}, ${Number(r.avg_network_tx)},
      ${Number(r.sample_count)}, NOW()
    )
    ON CONFLICT (node_id, "window", window_start) DO UPDATE SET
      cpu_avg        = EXCLUDED.cpu_avg,
      cpu_min        = EXCLUDED.cpu_min,
      cpu_max        = EXCLUDED.cpu_max,
      cpu_p95        = EXCLUDED.cpu_p95,
      ram_avg        = EXCLUDED.ram_avg,
      ram_min        = EXCLUDED.ram_min,
      ram_max        = EXCLUDED.ram_max,
      ram_p95        = EXCLUDED.ram_p95,
      disk_avg       = EXCLUDED.disk_avg,
      disk_min       = EXCLUDED.disk_min,
      disk_max       = EXCLUDED.disk_max,
      network_rx_avg = EXCLUDED.network_rx_avg,
      network_tx_avg = EXCLUDED.network_tx_avg,
      sample_count   = EXCLUDED.sample_count
  `

  return true
}

/**
 * Pour chaque fenêtre, calculer les périodes complètes écoulées depuis maintenant.
 * Ex: pour 5min à 10h23, on agrège 10h15-10h20 et 10h20-10h25 (si complètes).
 * On remonte jusqu'à 24h en arrière pour rattraper les fenêtres manquées.
 */
function getCompletedWindows(windowMinutes: number): Array<{ start: Date; end: Date }> {
  const now = new Date()
  const windows: Array<{ start: Date; end: Date }> = []

  // Aligner sur la grille (ex: 5min → 10h00, 10h05, 10h10...)
  const msPerWindow = windowMinutes * 60 * 1000
  const currentWindowEnd = new Date(Math.floor(now.getTime() / msPerWindow) * msPerWindow)

  // Remonter jusqu'à 24h en arrière pour rattraper les fenêtres manquées
  const lookbackMs = 24 * 60 * 60 * 1000
  let windowEnd = currentWindowEnd

  while (windowEnd.getTime() > now.getTime() - lookbackMs) {
    const windowStart = new Date(windowEnd.getTime() - msPerWindow)
    windows.push({ start: windowStart, end: windowEnd })
    windowEnd = windowStart
  }

  return windows
}

/**
 * Supprimer les métriques brutes de plus de 7 jours.
 */
async function cleanOldRawMetrics(): Promise<number> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const result = await prisma.$executeRaw`
    DELETE FROM metrics_raw
    WHERE collected_at < ${cutoff}
  `

  return result
}

async function cleanOldAggregatedMetrics(): Promise<number> {
  const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  return await prisma.$executeRaw`
    DELETE FROM metrics_aggregated
    WHERE window_start < ${cutoff}
  `
}

async function main() {
  console.log(`[aggregator] Starting at ${new Date().toISOString()}`)

  let totalInserted = 0
  let totalSkipped  = 0
  let hasError      = false

  for (const node of NODE_IDS) {
    for (const { name, minutes } of WINDOWS) {
      const completedWindows = getCompletedWindows(minutes)

      for (const { start, end } of completedWindows) {
        try {
          const inserted = await aggregateWindow(node, name, minutes, start, end)
          if (inserted) {
            totalInserted++
            console.log(`[aggregator] OK  ${node} ${name} ${start.toISOString()} → ${end.toISOString()}`)
          } else {
            totalSkipped++
          }
        } catch (error) {
          console.error(`[aggregator] ERROR ${node} ${name} ${start.toISOString()}:`, error)
          hasError = true
        }
      }
    }
  }

  // Nettoyage des données brutes > 30 jours
  try {
    const deleted = await cleanOldRawMetrics()
    console.log(`[aggregator] Cleanup: ${deleted} raw rows deleted (> 7 days)`)
  } catch (error) {
    console.error('[aggregator] Cleanup error:', error)
    hasError = true
  }

  // Nettoyage des données agrégats > 1 an
  try {
    const deletedAggregated = await cleanOldAggregatedMetrics()
    console.log(`[aggregator] Cleanup aggregated: ${deletedAggregated} rows deleted (> 1 year)`)
  } catch (error) {
    console.error('[aggregator] Cleanup aggregated error:', error)
    hasError = true
  }

  console.log(`[aggregator] Done — inserted: ${totalInserted}, skipped: ${totalSkipped}`)

  if (hasError) process.exit(1)
}

main()
  .catch((err) => {
    console.error('[aggregator] Fatal error:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())