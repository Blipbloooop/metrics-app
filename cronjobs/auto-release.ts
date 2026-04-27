/**
 * CronJob Kubernetes — Détection automatique des tâches terminées + relâchement des réservations
 * 3 déclencheurs :
 *   1. expires_at dépassé (timer)
 *   2. Charge CPU/RAM descendue sous le seuil (load_dropped)
 *   3. Job K8s terminé (Completed ou Failed) dans le namespace de la réservation
 *
 * Exécuté toutes les 2 minutes via le CronJob K8s auto-release.
 */

const APP_URL = process.env.APP_URL ?? 'http://metrics-app-service.app-production.svc.cluster.local:3000'
const TOKEN = process.env.METRICS_INGEST_TOKEN

async function main() {
  console.log(`[auto-release-job] Starting at ${new Date().toISOString()}`)

  if (!TOKEN) {
    console.error('[auto-release-job] METRICS_INGEST_TOKEN is not set')
    process.exit(1)
  }

  const res = await fetch(`${APP_URL}/api/auto-release`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    console.error(`[auto-release-job] HTTP ${res.status}: ${text}`)
    process.exit(1)
  }

  if (res.status === 204) {
    console.log('[auto-release-job] No reservations to release')
    return
  }

  const data = await res.json() as {
    total_released: number
    expired: { reservation_id: string; node_id: string; success: boolean }[]
    load_dropped: { reservation_id: string; node_id: string; success: boolean }[]
    job_completed: { reservation_id: string; node_id: string; success: boolean }[]
    ran_at: string
  }

  console.log(`[auto-release-job] Released ${data.total_released} reservation(s):`)
  data.expired.forEach(r => console.log(`  expired       → ${r.reservation_id} (${r.node_id}) success=${r.success}`))
  data.load_dropped.forEach(r => console.log(`  load_dropped  → ${r.reservation_id} (${r.node_id}) success=${r.success}`))
  data.job_completed.forEach(r => console.log(`  job_completed → ${r.reservation_id} (${r.node_id}) success=${r.success}`))

  console.log(`[auto-release-job] Done at ${new Date().toISOString()}`)
}

main().catch((err) => {
  console.error('[auto-release-job] Fatal error:', err)
  process.exit(1)
})
