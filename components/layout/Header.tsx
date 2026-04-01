'use client'

import { useRouter } from 'next/navigation'

interface HeaderProps {
  title: string
}

export default function Header({ title }: HeaderProps) {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <h1 className="text-gray-100 font-semibold">{title}</h1>
      <button
        onClick={handleLogout}
        className="text-sm text-gray-400 hover:text-gray-100 transition-colors"
      >
        Déconnexion
      </button>
    </header>
  )
}
