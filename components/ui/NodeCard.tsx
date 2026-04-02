import type { NodeCurrentMetrics } from '@/lib/types/dashboard'
import CpuRamChart from '@/components/charts/CpuRamChart'

interface NodeCardProps {
  metrics: NodeCurrentMetrics
}

function GaugeBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
      <span className="text-xs text-gray-300 w-10 text-right">{value.toFixed(1)}%</span>
    </div>
  )
}

export default function NodeCard({ metrics }: NodeCardProps) {
  const { nodeId, cpu, ram, disk, isOnline, history } = metrics

  const borderColor = !isOnline
    ? 'border-gray-700'
    : cpu >= 90 || ram >= 95
      ? 'border-red-500'
      : cpu >= 80 || ram >= 85
        ? 'border-yellow-500'
        : 'border-green-500'

  return (
    <div className={`bg-gray-800 rounded-lg p-4 border ${borderColor}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-gray-100 font-medium text-sm">{nodeId}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
          ${isOnline ? 'bg-green-900 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
          {isOnline ? 'En ligne' : 'Hors ligne'}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div>
          <span className="text-xs text-gray-500 mb-1 block">CPU</span>
          <GaugeBar value={cpu} color={cpu >= 90 ? 'bg-red-500' : cpu >= 80 ? 'bg-yellow-500' : 'bg-blue-400'} />
        </div>
        <div>
          <span className="text-xs text-gray-500 mb-1 block">RAM</span>
          <GaugeBar value={ram} color={ram >= 95 ? 'bg-red-500' : ram >= 85 ? 'bg-yellow-500' : 'bg-purple-400'} />
        </div>
        <div>
          <span className="text-xs text-gray-500 mb-1 block">Disque</span>
          <GaugeBar value={disk} color="bg-gray-400" />
        </div>
      </div>

      {history.length > 0 && (
        <CpuRamChart data={history} nodeName={nodeId} />
      )}
    </div>
  )
}
