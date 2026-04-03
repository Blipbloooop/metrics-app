import { getAllCurrentMetrics } from '@/lib/dashboard-data'
import DashboardClient from '@/components/dashboard/DashboardClient'
import Header from '@/components/layout/Header'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Chargement initial côté serveur (30 min par défaut)
  const initialMetrics = await getAllCurrentMetrics(30)

  return (
    <div className="flex flex-col h-full">
      <Header title="Charge actuelle" />
      <DashboardClient initialMetrics={initialMetrics} />
    </div>
  )
}
