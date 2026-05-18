'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']

export default function ReservationForm() {
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

  const [namespaces, setNamespaces] = useState<string[]>([])
  const [nsLoading, setNsLoading] = useState(true)
  const [namespace, setNamespace] = useState('')

  const [deployments, setDeployments] = useState<string[]>([])
  const [deploymentsLoading, setDeploymentsLoading] = useState(false)

  useEffect(() => {
    fetch('/api/namespaces')
      .then(r => r.json())
      .then(data => {
        const list: string[] = data.namespaces ?? []
        setNamespaces(list)
        if (list.length > 0) setNamespace(list[0])
      })
      .catch(() => {
        const fallback = ['default', 'app-production']
        setNamespaces(fallback)
        setNamespace(fallback[0])
      })
      .finally(() => setNsLoading(false))
  }, [])

  useEffect(() => {
    if (!namespace) return
    setDeploymentsLoading(true)
    setDeployments([])
    fetch(`/api/deployments?namespace=${encodeURIComponent(namespace)}`)
      .then(r => r.json())
      .then(data => setDeployments(data.deployments ?? []))
      .catch(() => setDeployments([]))
      .finally(() => setDeploymentsLoading(false))
  }, [namespace])

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('loading')
    setMessage(null)

    const form = new FormData(e.currentTarget)
    const body = {
      node_id:          form.get('node_id'),
      deployment_name:  form.get('deployment_name'),
      namespace:        form.get('namespace'),
      cpu_per_replica:  parseFloat(form.get('cpu_per_replica') as string),
      ram_per_replica:  parseFloat(form.get('ram_per_replica') as string),
      replica_count:    parseInt(form.get('replica_count') as string, 10),
      duration_minutes: parseInt(form.get('duration_minutes') as string, 10),
      reason:           form.get('reason') as string | null,
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
        setMessage(`Réservation créée — ID : ${data.reservation_id ?? '?'}`)
        router.refresh()
      }
    } catch {
      setStatus('error')
      setMessage('Impossible de contacter le serveur')
    }
  }

  const noDeployments = !deploymentsLoading && deployments.length === 0 && !!namespace

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
          <label className="block text-xs text-gray-400 mb-1">Namespace</label>
          <select name="namespace" required disabled={nsLoading}
            value={namespace}
            onChange={e => setNamespace(e.target.value)}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50">
            {nsLoading
              ? <option value="">Chargement…</option>
              : namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)
            }
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Deployment</label>
          <select name="deployment_name" required
            disabled={deploymentsLoading || noDeployments}
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50">
            {deploymentsLoading
              ? <option value="">Chargement…</option>
              : noDeployments
                ? <option value="">Aucun deployment</option>
                : deployments.map(d => <option key={d} value={d}>{d}</option>)
            }
          </select>
          {noDeployments && (
            <p className="text-xs text-yellow-500 mt-1">Aucun deployment dans ce namespace.</p>
          )}
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">CPU / replica (cores)</label>
          <input name="cpu_per_replica" type="number" step="0.1" min="0.1" required defaultValue="0.5"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">RAM / replica (GB)</label>
          <input name="ram_per_replica" type="number" step="0.1" min="0.1" required defaultValue="1"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Réplicas</label>
          <input name="replica_count" type="number" min="1" max="10" required defaultValue="1"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Durée (minutes)</label>
          <input name="duration_minutes" type="number" min="5" max="1440" required defaultValue="60"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div className="col-span-2">
          <label className="block text-xs text-gray-400 mb-1">Raison (optionnel)</label>
          <input name="reason" type="text" placeholder="ex: pics de charge prévus"
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

      <button type="submit" disabled={status === 'loading' || noDeployments}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
        {status === 'loading' ? 'Réservation en cours…' : 'Réserver les ressources'}
      </button>
    </form>
  )
}
