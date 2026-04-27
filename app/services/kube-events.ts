import * as k8s from '@kubernetes/client-node'
import prisma from '@/lib/prisma'

const WATCH_NAMESPACES = ['app-production', 'app-staging']
// Ne conserver que les events des 2 dernières heures lors de chaque sync
const EVENT_WINDOW_MS = 2 * 60 * 60 * 1000

const kc = new k8s.KubeConfig()
kc.loadFromDefault()
const coreApi = kc.makeApiClient(k8s.CoreV1Api)

export interface EventSyncResult {
  namespace: string
  upserted: number
  error?: string
}

export async function syncNamespaceEvents(namespace: string): Promise<EventSyncResult> {
  let events: k8s.CoreV1Event[] = []
  try {
    const res = await coreApi.listNamespacedEvent({ namespace })
    events = res.items
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    console.warn(`[kube-events] Cannot list events in ${namespace}: ${error}`)
    return { namespace, upserted: 0, error }
  }

  const cutoff = new Date(Date.now() - EVENT_WINDOW_MS)
  const recent = events.filter((e) => {
    const t = e.lastTimestamp ?? e.eventTime
    return t ? new Date(t) >= cutoff : false
  })

  let upserted = 0
  for (const e of recent) {
    const uid = e.metadata?.uid
    if (!uid) continue

    const firstTime = e.firstTimestamp ?? e.eventTime ?? new Date()
    const lastTime  = e.lastTimestamp  ?? e.eventTime ?? new Date()

    await prisma.kubeEvent.upsert({
      where: { uid },
      create: {
        uid,
        namespace,
        type:        e.type        ?? 'Normal',
        reason:      e.reason      ?? '',
        message:     e.message     ?? '',
        object_kind: e.involvedObject?.kind ?? null,
        object_name: e.involvedObject?.name ?? null,
        count:       e.count       ?? 1,
        first_time:  new Date(firstTime as string | Date),
        last_time:   new Date(lastTime  as string | Date),
      },
      update: {
        count:     e.count ?? 1,
        last_time: new Date(lastTime as string | Date),
        message:   e.message ?? '',
        synced_at: new Date(),
      },
    })
    upserted++
  }

  console.log(`[kube-events] ${namespace}: ${upserted} events upserted`)
  return { namespace, upserted }
}

export async function syncAllNamespaces(): Promise<{
  results: EventSyncResult[]
  total_upserted: number
  ran_at: string
}> {
  console.log(`[kube-events] Sync started at ${new Date().toISOString()}`)
  const results: EventSyncResult[] = []

  for (const ns of WATCH_NAMESPACES) {
    results.push(await syncNamespaceEvents(ns))
  }

  const total_upserted = results.reduce((s, r) => s + r.upserted, 0)
  console.log(`[kube-events] Done — ${total_upserted} total upserted`)
  return { results, total_upserted, ran_at: new Date().toISOString() }
}
