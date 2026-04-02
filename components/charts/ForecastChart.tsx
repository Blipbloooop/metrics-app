'use client'

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { ForecastStep } from '@/lib/types/dashboard'

interface ForecastChartProps {
  forecast: ForecastStep[]
  riskLevel: 'low' | 'medium' | 'high'
  cpuPeak: number
}

const RISK_COLOR: Record<string, string> = {
  low:    '#34D399',
  medium: '#FBBF24',
  high:   '#F87171',
}

// cpuPeak est disponible pour une future logique de seuil personnalisé
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ForecastChart({ forecast, riskLevel, cpuPeak }: ForecastChartProps) {
  if (forecast.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
        Prédiction non disponible
      </div>
    )
  }

  const color = RISK_COLOR[riskLevel]

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={forecast} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <defs>
          <linearGradient id={`grad-cpu-${riskLevel}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`grad-ram-${riskLevel}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#A78BFA" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="t" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fill: '#9CA3AF', fontSize: 11 }} unit="%" />
        <Tooltip
          contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', borderRadius: 6 }}
          formatter={(value) => [`${Number(value).toFixed(1)}%`]}
        />
        <Legend wrapperStyle={{ color: '#9CA3AF', fontSize: 12 }} />
        <ReferenceLine y={90} stroke="#F87171" strokeDasharray="4 4" label={{ value: 'Critique 90%', fill: '#F87171', fontSize: 10 }} />
        <Area
          type="monotone" dataKey="cpu_percent" name="CPU prédit"
          stroke={color} strokeWidth={2}
          fill={`url(#grad-cpu-${riskLevel})`}
          strokeDasharray="5 5"
        />
        <Area
          type="monotone" dataKey="ram_percent" name="RAM prédite"
          stroke="#A78BFA" strokeWidth={2}
          fill={`url(#grad-ram-${riskLevel})`}
          strokeDasharray="5 5"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
