'use client'

import { useEffect, useState, useCallback } from 'react'
import NodeCard from '@/components/ui/NodeCard'
import type { NodeCurrentMetrics } from '@/lib/types/dashboard'

const WINDOWS = [
  { label: '30 min', value: 30 },
  { label: '1h',     value: 60 },
  { label: '6h',     value: 360 },
] as const

type WindowValue = typeof WINDOWS[number]['value']

const POLL_INTERVAL_MS = 30_000

interface Props {
  initialMetrics: NodeCurrentMetrics[]
}

export default function DashboardClient({ initialMetrics }: Props) {
  const [metrics, setMetrics] = useState<NodeCurrentMetrics[]>(initialMetrics)
  const [window, setWindow] = useState<WindowValue>(30)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())
  const [error, setError] = useState<string | null>(null)

  const fetchMetrics = useCallback(async (w: WindowValue) => {
    try {
      const res = await fetch(`/api/metrics/current?window=${w}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: NodeCurrentMetrics[] = await res.json()
      setMetrics(data)
      setLastUpdate(new Date())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau')
    }
  }, [])

  // Fetch immédiatement quand la fenêtre change
  useEffect(() => {
    fetchMetrics(window)
  }, [window, fetchMetrics])

  // Polling toutes les 30s
  useEffect(() => {
    const id = setInterval(() => fetchMetrics(window), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [window, fetchMetrics])

  const onlineCount = metrics.filter(m => m.isOnline).length

  return (
    <div className="p-6">
      {/* Barre d'état + sélecteur */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-gray-400 text-sm">
          {onlineCount}/{metrics.length} nœuds en ligne
          {error
            ? <span className="text-red-400 ml-2">— {error}</span>
            : <span className="text-gray-600 ml-2">— mis à jour à {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Europe/Paris' })}</span>
          }
        </p>

        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                window === w.value
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grille des nodes */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {metrics.map(m => (
          <NodeCard key={m.nodeId} metrics={m} />
        ))}
      </div>
    </div>
  )
}
