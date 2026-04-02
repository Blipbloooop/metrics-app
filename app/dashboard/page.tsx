import { getAllCurrentMetrics } from '@/lib/dashboard-data'
import NodeCard from '@/components/ui/NodeCard'
import Header from '@/components/layout/Header'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const metrics = await getAllCurrentMetrics()
  const onlineCount = metrics.filter(m => m.isOnline).length

  return (
    <div className="flex flex-col h-full">
      <Header title="Charge actuelle" />
      <div className="p-6">
        <p className="text-gray-400 text-sm mb-6">
          {onlineCount}/{metrics.length} nœuds en ligne — actualisation toutes les 30s
        </p>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {metrics.map(m => (
            <NodeCard key={m.nodeId} metrics={m} />
          ))}
        </div>
      </div>
    </div>
  )
}
