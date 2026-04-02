'use client'
import { useEffect, useState, useRef } from 'react'

interface Alert {
  id: string
  node_id: string | null
  severity: string
  message: string
  triggered_at: string
}

export default function AlertsBadge() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/alerts').then(r => r.json()).then(setAlerts).catch(() => {})
    const interval = setInterval(() => {
      fetch('/api/alerts').then(r => r.json()).then(setAlerts).catch(() => {})
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function acknowledgeAll() {
    await fetch('/api/alerts', { method: 'PATCH' })
    setAlerts([])
    setOpen(false)
  }

  const count = alerts.length

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 text-gray-400 hover:text-gray-100 transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-semibold text-gray-100">Alertes ({count})</h3>
            {count > 0 && (
              <button onClick={acknowledgeAll} className="text-xs text-blue-400 hover:text-blue-300">
                Tout acquitter
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {count === 0 ? (
              <p className="text-gray-500 text-sm px-4 py-3">Aucune alerte active</p>
            ) : (
              alerts.map(a => (
                <div
                  key={a.id}
                  className={`px-4 py-3 border-b border-gray-700/50 ${
                    a.severity === 'critical' ? 'border-l-2 border-l-red-500' : 'border-l-2 border-l-yellow-500'
                  }`}
                >
                  <p className="text-xs text-gray-200">{a.message}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {a.node_id} · {new Date(a.triggered_at).toLocaleTimeString('fr-FR')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
