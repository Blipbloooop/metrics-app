// Types partagés entre Server Components et Client Components du dashboard

export interface CpuRamDataPoint {
  timestamp: string   // format "HH:mm" pour l'affichage
  cpu: number         // 0-100
  ram: number         // 0-100
}

export interface NodeCurrentMetrics {
  nodeId: string
  cpu: number
  ram: number
  disk: number
  lastCollectedAt: string   // ISO string
  isOnline: boolean         // false si dernière collecte > 2min
  history: CpuRamDataPoint[]
}

export interface ForecastStep {
  t: string           // ex: "+5min"
  cpu_percent: number
  ram_percent: number
}

export interface NodeForecast {
  nodeId: string
  forecast: ForecastStep[]
  cpu_avg: number
  cpu_peak: number
  ram_avg: number
  ram_peak: number
  riskLevel: 'low' | 'medium' | 'high'
  model_used: string
  timestamp: string
}

export interface ActiveReservation {
  id: string
  nodeId: string
  triggeredBy: 'automatic' | 'manual'
  cpuReserved: number
  ramReservedGb: number
  reservedAt: string
  expiresAt: string | null
  notes: string | null
}
