'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const form = new FormData(e.currentTarget)
    const username = form.get('username') as string
    const password = form.get('password') as string

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Erreur de connexion')
        return
      }

      router.push('/dashboard')
    } catch {
      setError('Impossible de contacter le serveur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="bg-gray-800 rounded-xl p-8 w-full max-w-sm shadow-xl">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">metrics-app</h1>
        <p className="text-gray-400 text-sm mb-6">Dashboard administrateur</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Utilisateur</label>
            <input
              name="username" type="text" required autoComplete="username"
              className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm
                         border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Mot de passe</label>
            <input
              name="password" type="password" required autoComplete="current-password"
              className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm
                         border border-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/30 border border-red-700 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50
                       text-white rounded-lg py-2 text-sm font-medium transition-colors"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  )
}
