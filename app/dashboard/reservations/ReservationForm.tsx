'use client'

import { useState, FormEvent } from 'react'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']

export default function ReservationForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setMessage(null)

    const form = new FormData(e.currentTarget)
    const body = {
      node_id:              form.get('node_id'),
      deployment_name:      form.get('deployment_name'),
      namespace:            form.get('namespace'),
      cpu_per_replica:      parseFloat(form.get('cpu_per_replica') as string),
      ram_gb_per_replica:   parseFloat(form.get('ram_gb_per_replica') as string),
      replicas:             parseInt(form.get('replicas') as string, 10),
      duration_minutes:     parseInt(form.get('duration_minutes') as string, 10),
    }

    try {
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? `Erreur ${res.status}`)
      } else {
        setStatus('success')
        setMessage(`Réservation créée — ID : ${data.reservation?.id ?? '?'}`)
        ;(e.target as HTMLFormElement).reset()
      }
    } catch {
      setStatus('error')
      setMessage('Impossible de contacter le serveur')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg p-6 max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Nœud</label>
          <select name="node_id" required
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500">
            {NODES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Deployment</label>
          <input name="deployment_name" type="text" required placeholder="ex: mon-app"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Namespace</label>
          <input name="namespace" type="text" required defaultValue="default"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">CPU / replica (cores)</label>
          <input name="cpu_per_replica" type="number" step="0.1" min="0.1" required defaultValue="0.5"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">RAM / replica (GB)</label>
          <input name="ram_gb_per_replica" type="number" step="0.1" min="0.1" required defaultValue="1"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Réplicas</label>
          <input name="replicas" type="number" min="1" max="10" required defaultValue="1"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Durée (minutes)</label>
          <input name="duration_minutes" type="number" min="5" max="1440" required defaultValue="60"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {message && (
        <p className={`text-sm rounded-lg px-3 py-2 ${
          status === 'success'
            ? 'bg-green-900/30 border border-green-700 text-green-400'
            : 'bg-red-900/30 border border-red-700 text-red-400'
        }`}>
          {message}
        </p>
      )}

      <button type="submit" disabled={status === 'loading'}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
        {status === 'loading' ? 'Réservation en cours…' : 'Réserver les ressources'}
      </button>
    </form>
  )
}
