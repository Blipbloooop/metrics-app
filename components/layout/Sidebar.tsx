'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard',              label: 'Charge actuelle',  icon: '📊' },
  { href: '/dashboard/predictions',  label: 'Prédictions',      icon: '🔮' },
  { href: '/dashboard/reservations', label: 'Réservations',     icon: '🗂️'  },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 bg-gray-900 border-r border-gray-800 flex flex-col min-h-screen">
      <div className="px-4 py-5 border-b border-gray-800">
        <span className="text-blue-400 font-bold text-lg">metrics-app</span>
        <p className="text-gray-500 text-xs mt-0.5">Dashboard admin</p>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href} href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${active
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'}`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-800">
        <p className="text-xs text-gray-600">k8s-master · worker-1 · worker-2</p>
      </div>
    </aside>
  )
}
