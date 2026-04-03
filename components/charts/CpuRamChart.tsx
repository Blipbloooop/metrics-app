'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { CpuRamDataPoint } from '@/lib/types/dashboard'

interface CpuRamChartProps {
  data: CpuRamDataPoint[]
  nodeName: string
}

export default function CpuRamChart({ data, nodeName }: CpuRamChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        Aucune donnée disponible pour {nodeName}
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="timestamp" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 11 }} unit="%" />
        <Tooltip
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 6 }}
          labelStyle={{ color: '#F3F4F6' }}
          formatter={(value) => [`${Number(value).toFixed(1)}%`]}
        />
        <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
        <Line
          type="monotone" dataKey="cpu" name="CPU"
          stroke="#60A5FA" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
        />
        <Line
          type="monotone" dataKey="ram" name="RAM"
          stroke="#A78BFA" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
        />
        <Line
          type="monotone" dataKey="disk" name="Disque"
          stroke="#34D399" strokeWidth={2} dot={false} activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
