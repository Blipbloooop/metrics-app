'use client'

import { useEffect, useState } from 'react'
import ForecastChart from './ForecastChart'
import SkeletonCard from '@/components/ui/SkeletonCard'
import StatusBadge from '@/components/ui/StatusBadge'
import type { NodeForecast } from '@/lib/types/dashboard'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']

export default function ForecastPanel() {
  const [forecasts, setForecasts] = useState<NodeForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchForecasts() {
      try {
        const results: NodeForecast[] = []
        for (const nodeId of NODES) {
          const res = await fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: nodeId, horizon_minutes: 30, step_minutes: 5 }),
          })
          if (!res.ok) throw new Error(`Forecast échoué pour ${nodeId}: ${res.status}`)
          const data = await res.json()
          const cpuPeak = data.summary?.cpu_peak ?? data.cpu_peak ?? 0
          const riskLevel: 'low' | 'medium' | 'high' =
            cpuPeak >= 90 ? 'high' : cpuPeak >= 70 ? 'medium' : 'low'
          results.push({
            nodeId,
            forecast: data.forecast ?? [],
            cpu_avg: data.summary?.cpu_avg ?? 0,
            cpu_peak: cpuPeak,
            ram_avg: data.summary?.ram_avg ?? 0,
            ram_peak: data.summary?.ram_peak ?? 0,
            model_used: data.model_used ?? 'unknown',
            timestamp: data.predicted_at ?? new Date().toISOString(),
            riskLevel,
          } as NodeForecast)
        }
        setForecasts(results)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    fetchForecasts()
  }, [])

  if (loading) return (
    <div className="grid grid-cols-1 gap-6">
      {NODES.map(n => <SkeletonCard key={n} />)}
    </div>
  )

  if (error) return (
    <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">
      {error}
    </div>
  )

  return (
    <div className="grid grid-cols-1 gap-6">
      {forecasts.map(f => (
        <div key={f.nodeId} className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-100 font-medium">{f.nodeId}</h3>
            <StatusBadge level={f.riskLevel} label={`Risque ${f.riskLevel}`} />
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3 text-sm">
            <div className="text-gray-400">CPU moy: <span className="text-gray-100">{f.cpu_avg.toFixed(1)}%</span></div>
            <div className="text-gray-400">CPU pic: <span className="text-gray-100">{f.cpu_peak.toFixed(1)}%</span></div>
            <div className="text-gray-400">RAM moy: <span className="text-gray-100">{f.ram_avg.toFixed(1)}%</span></div>
            <div className="text-gray-400">RAM pic: <span className="text-gray-100">{f.ram_peak.toFixed(1)}%</span></div>
          </div>
          <ForecastChart forecast={f.forecast} riskLevel={f.riskLevel} cpuPeak={f.cpu_peak} />
          <p className="text-xs text-gray-500 mt-2">Modèle: {f.model_used} — {new Date(f.timestamp).toLocaleTimeString('fr-FR')}</p>
        </div>
      ))}
    </div>
  )
}
