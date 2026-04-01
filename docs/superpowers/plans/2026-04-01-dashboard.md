# Dashboard Administrateur — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construire le dashboard admin (sidebar + charge actuelle + prédictions + réservations) en partant de zéro sur un backend Next.js déjà complet.

**Architecture:** Layout App Router avec sidebar persistante. Server Components pour les données initiales (Prisma direct). Client Components pour Recharts et le formulaire de réservation. Auth via cookie httpOnly `session` — le middleware valide le cookie pour `/dashboard/*` et pour les appels API depuis le client.

**Tech Stack:** Next.js 14 App Router, Recharts, Prisma (`lib/prisma.ts`), Tailwind CSS, TypeScript strict.

**Spec de référence:** `docs/superpowers/specs/2026-04-01-dashboard-design.md`

---

## Map des fichiers

| Fichier | Action | Responsabilité |
|---------|--------|----------------|
| `package.json` | Modifié | Ajout `recharts` |
| `lib/dashboard-data.ts` | Créé | Requêtes Prisma pour le dashboard |
| `app/api/auth/login/route.ts` | Créé | POST → cookie httpOnly `session` |
| `middleware.ts` | Modifié | Auth `/dashboard/*` + cookie accepté sur API |
| `app/login/page.tsx` | Créé | Formulaire connexion (Client Component) |
| `app/dashboard/layout.tsx` | Créé | Sidebar + Header persistants |
| `app/dashboard/page.tsx` | Créé | Charge actuelle (PRV-46) |
| `app/dashboard/predictions/page.tsx` | Créé | Charge prédite (PRV-47) |
| `app/dashboard/reservations/page.tsx` | Créé | Réservations + formulaire (PRV-48/49) |
| `components/layout/Sidebar.tsx` | Créé | Navigation latérale |
| `components/layout/Header.tsx` | Créé | Barre supérieure + logout |
| `components/charts/CpuRamChart.tsx` | Créé | LineChart CPU/RAM Recharts |
| `components/charts/ForecastChart.tsx` | Créé | AreaChart prédictions Recharts |
| `components/charts/ForecastPanel.tsx` | Créé | Client Component — fetch + ForecastChart |
| `components/ui/NodeCard.tsx` | Créé | Carte métriques nœud |
| `components/ui/ReservationCard.tsx` | Créé | Carte réservation active |
| `components/ui/StatusBadge.tsx` | Créé | Badge coloré low/medium/high |
| `components/ui/SkeletonCard.tsx` | Créé | Loading skeleton |
| `tests/lib/dashboard-data.test.ts` | Créé | Tests couche données |
| `tests/components/StatusBadge.test.tsx` | Créé | Test rendu badge |
| `tests/components/NodeCard.test.tsx` | Créé | Test rendu NodeCard |

---

## Task 1: Installer Recharts + types de données des charts

**Tickets:** PRV-50
**Files:**
- Modify: `package.json`
- Create: `lib/types/dashboard.ts`

- [ ] **Step 1: Installer recharts**

```bash
cd /Users/jean-baptiste/Desktop/metrics-app
npm install recharts
```

Expected: `recharts` apparaît dans `node_modules/`, pas d'erreur.

- [ ] **Step 2: Créer les types dashboard**

Créer `lib/types/dashboard.ts` :

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json lib/types/dashboard.ts
git commit --author="jibé <jibe@metrics-app>" -m "feat: install recharts + dashboard types (PRV-50)

Base de la librairie de charts et types TypeScript partagés
entre Server/Client Components du dashboard.
Recharts choisi à la place de Chart.js : API React native,
pas de manipulation de canvas, plus facile à themer."
```

---

## Task 2: Composants UI atomiques — StatusBadge + SkeletonCard

**Files:**
- Create: `components/ui/StatusBadge.tsx`
- Create: `components/ui/SkeletonCard.tsx`
- Create: `tests/components/StatusBadge.test.tsx`

- [ ] **Step 1: Écrire le test StatusBadge (doit échouer)**

Créer `tests/components/StatusBadge.test.tsx` :

```typescript
import { render, screen } from '@testing-library/react'
import StatusBadge from '@/components/ui/StatusBadge'

describe('StatusBadge', () => {
  it('affiche "low" en vert', () => {
    render(<StatusBadge level="low" />)
    const badge = screen.getByText('low')
    expect(badge).toHaveClass('bg-green-500')
  })

  it('affiche "medium" en orange', () => {
    render(<StatusBadge level="medium" />)
    const badge = screen.getByText('medium')
    expect(badge).toHaveClass('bg-yellow-500')
  })

  it('affiche "high" en rouge', () => {
    render(<StatusBadge level="high" />)
    const badge = screen.getByText('high')
    expect(badge).toHaveClass('bg-red-500')
  })

  it('accepte un label personnalisé', () => {
    render(<StatusBadge level="high" label="Critique" />)
    expect(screen.getByText('Critique')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx jest tests/components/StatusBadge.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/ui/StatusBadge'`

- [ ] **Step 3: Installer @testing-library/react si absent**

```bash
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

Ajouter dans `jest.config.ts` si pas déjà présent :
```typescript
setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
```

Créer `jest.setup.ts` :
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Implémenter StatusBadge**

Créer `components/ui/StatusBadge.tsx` :

```typescript
interface StatusBadgeProps {
  level: 'low' | 'medium' | 'high' | 'active' | 'released' | 'pending' | 'failed'
  label?: string
}

const COLOR_MAP: Record<StatusBadgeProps['level'], string> = {
  low:      'bg-green-500 text-white',
  active:   'bg-green-500 text-white',
  medium:   'bg-yellow-500 text-gray-900',
  pending:  'bg-yellow-500 text-gray-900',
  high:     'bg-red-500 text-white',
  failed:   'bg-red-500 text-white',
  released: 'bg-gray-500 text-white',
}

export default function StatusBadge({ level, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${COLOR_MAP[level]}`}>
      {label ?? level}
    </span>
  )
}
```

- [ ] **Step 5: Créer SkeletonCard**

Créer `components/ui/SkeletonCard.tsx` :

```typescript
export default function SkeletonCard() {
  return (
    <div className="bg-gray-800 rounded-lg p-4 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-1/3 mb-3" />
      <div className="h-8 bg-gray-700 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-700 rounded w-2/3" />
    </div>
  )
}
```

- [ ] **Step 6: Lancer les tests**

```bash
npx jest tests/components/StatusBadge.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add components/ui/StatusBadge.tsx components/ui/SkeletonCard.tsx tests/components/StatusBadge.test.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: StatusBadge + SkeletonCard (dashboard UI atoms)

StatusBadge : badge coloré pour low/medium/high/active/released/pending/failed.
SkeletonCard : placeholder de chargement animate-pulse Tailwind.
Tailwind pur, pas de lib UI externe — modifiable librement."
```

---

## Task 3: CpuRamChart — LineChart Recharts

**Tickets:** PRV-50
**Files:**
- Create: `components/charts/CpuRamChart.tsx`

- [ ] **Step 1: Créer CpuRamChart**

Créer `components/charts/CpuRamChart.tsx` :

```typescript
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
          formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
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
      </LineChart>
    </ResponsiveContainer>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/charts/CpuRamChart.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: CpuRamChart — Recharts LineChart CPU/RAM (PRV-50)

Graphique temps réel CPU (bleu) + RAM (violet) par nœud.
Responsive, dark theme Tailwind, tooltip formaté.
'use client' requis pour Recharts (manipulation DOM canvas)."
```

---

## Task 4: ForecastChart + ForecastPanel

**Tickets:** PRV-50 / PRV-47
**Files:**
- Create: `components/charts/ForecastChart.tsx`
- Create: `components/charts/ForecastPanel.tsx`

- [ ] **Step 1: Créer ForecastChart**

Créer `components/charts/ForecastChart.tsx` :

```typescript
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
          formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name]}
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
```

- [ ] **Step 2: Créer ForecastPanel (Client Component qui appelle /api/forecast)**

Créer `components/charts/ForecastPanel.tsx` :

```typescript
'use client'

import { useEffect, useState } from 'react'
import ForecastChart from './ForecastChart'
import SkeletonCard from '@/components/ui/SkeletonCard'
import StatusBadge from '@/components/ui/StatusBadge'
import type { NodeForecast } from '@/lib/types/dashboard'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']

export default function ForecastPanel() {
  const [forecasts, setForecasts] = useState<NodeForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchForecasts() {
      try {
        const results = await Promise.all(
          NODES.map(async (nodeId) => {
            const res = await fetch('/api/forecast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ node_id: nodeId, horizon_minutes: 30, step_minutes: 5 }),
            })
            if (!res.ok) throw new Error(`Forecast échoué pour ${nodeId}: ${res.status}`)
            const data = await res.json()
            // Déduire riskLevel depuis cpu_peak
            const riskLevel: 'low' | 'medium' | 'high' =
              data.cpu_peak >= 90 ? 'high' : data.cpu_peak >= 70 ? 'medium' : 'low'
            return { nodeId, ...data, riskLevel } as NodeForecast
          })
        )
        setForecasts(results)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }
    fetchForecasts()
  }, [])

  if (loading) return (
    <div className="grid grid-cols-1 gap-6">
      {NODES.map(n => <SkeletonCard key={n} />)}
    </div>
  )

  if (error) return (
    <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 text-red-400">
      {error}
    </div>
  )

  return (
    <div className="grid grid-cols-1 gap-6">
      {forecasts.map(f => (
        <div key={f.nodeId} className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gray-100 font-medium">{f.nodeId}</h3>
            <StatusBadge level={f.riskLevel} label={`Risque ${f.riskLevel}`} />
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3 text-sm">
            <div className="text-gray-400">CPU moy: <span className="text-gray-100">{f.cpu_avg.toFixed(1)}%</span></div>
            <div className="text-gray-400">CPU pic: <span className="text-gray-100">{f.cpu_peak.toFixed(1)}%</span></div>
            <div className="text-gray-400">RAM moy: <span className="text-gray-100">{f.ram_avg.toFixed(1)}%</span></div>
            <div className="text-gray-400">RAM pic: <span className="text-gray-100">{f.ram_peak.toFixed(1)}%</span></div>
          </div>
          <ForecastChart forecast={f.forecast} riskLevel={f.riskLevel} cpuPeak={f.cpu_peak} />
          <p className="text-xs text-gray-500 mt-2">Modèle: {f.model_used} — {new Date(f.timestamp).toLocaleTimeString('fr-FR')}</p>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add components/charts/ForecastChart.tsx components/charts/ForecastPanel.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: ForecastChart + ForecastPanel — prédictions Recharts (PRV-47/50)

ForecastChart : AreaChart avec gradient coloré selon niveau de risque
(vert low / orange medium / rouge high), ligne de référence à 90%.
ForecastPanel : Client Component qui appelle POST /api/forecast
pour les 3 nœuds en parallèle, gère loading/erreur."
```

---

## Task 5: Couche données dashboard — lib/dashboard-data.ts

**Files:**
- Create: `lib/dashboard-data.ts`
- Create: `tests/lib/dashboard-data.test.ts`

- [ ] **Step 1: Écrire les tests (doivent échouer)**

Créer `tests/lib/dashboard-data.test.ts` :

```typescript
// Mock Prisma avant tous les imports
jest.mock('@/lib/prisma', () => ({
  prisma: {
    metricsRaw: { findMany: jest.fn() },
    reservation: { findMany: jest.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { getCurrentMetrics, getActiveReservations } from '@/lib/dashboard-data'

const mockMetrics = jest.mocked(prisma.metricsRaw.findMany)
const mockReservations = jest.mocked(prisma.reservation.findMany)

beforeEach(() => jest.clearAllMocks())

describe('getCurrentMetrics', () => {
  it('retourne un NodeCurrentMetrics par nœud avec history formatée', async () => {
    const now = new Date()
    const oneMinAgo = new Date(now.getTime() - 60_000)

    mockMetrics.mockResolvedValue([
      {
        id: '1', node_id: 'k8s-master',
        cpu_percent: 45.5, ram_percent: 62.1, disk_percent: 30.0,
        network_rx_mb: 1.2, network_tx_mb: 0.8,
        collected_at: oneMinAgo, created_at: oneMinAgo,
      },
      {
        id: '2', node_id: 'k8s-master',
        cpu_percent: 47.0, ram_percent: 63.0, disk_percent: 30.1,
        network_rx_mb: 1.3, network_tx_mb: 0.9,
        collected_at: now, created_at: now,
      },
    ] as never)

    const result = await getCurrentMetrics('k8s-master')

    expect(result.nodeId).toBe('k8s-master')
    expect(result.cpu).toBeCloseTo(47.0)
    expect(result.ram).toBeCloseTo(63.0)
    expect(result.isOnline).toBe(true)
    expect(result.history).toHaveLength(2)
    expect(result.history[0]).toHaveProperty('timestamp')
    expect(result.history[0]).toHaveProperty('cpu')
    expect(result.history[0]).toHaveProperty('ram')
  })

  it('marque isOnline false si dernière collecte > 2min', async () => {
    const threeMinAgo = new Date(Date.now() - 3 * 60_000)
    mockMetrics.mockResolvedValue([
      {
        id: '1', node_id: 'k8s-worker-2',
        cpu_percent: 20.0, ram_percent: 40.0, disk_percent: 20.0,
        network_rx_mb: 0, network_tx_mb: 0,
        collected_at: threeMinAgo, created_at: threeMinAgo,
      },
    ] as never)

    const result = await getCurrentMetrics('k8s-worker-2')
    expect(result.isOnline).toBe(false)
  })

  it('retourne des valeurs à zéro si aucune métrique', async () => {
    mockMetrics.mockResolvedValue([])
    const result = await getCurrentMetrics('k8s-worker-1')
    expect(result.cpu).toBe(0)
    expect(result.isOnline).toBe(false)
    expect(result.history).toHaveLength(0)
  })
})

describe('getActiveReservations', () => {
  it('retourne les réservations actives formatées', async () => {
    const now = new Date()
    mockReservations.mockResolvedValue([
      {
        id: 'res-1', node_id: 'k8s-worker-1',
        triggered_by: 'manual', status: 'active',
        cpu_reserved: 2.0, ram_reserved_gb: 4.0,
        reserved_at: now, expires_at: null,
        released_at: null, notes: 'Test', prediction_id: null,
      },
    ] as never)

    const result = await getActiveReservations()
    expect(result).toHaveLength(1)
    expect(result[0].nodeId).toBe('k8s-worker-1')
    expect(result[0].cpuReserved).toBe(2.0)
    expect(result[0].triggeredBy).toBe('manual')
  })
})
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

```bash
npx jest tests/lib/dashboard-data.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/dashboard-data'`

- [ ] **Step 3: Implémenter dashboard-data.ts**

Créer `lib/dashboard-data.ts` :

```typescript
import { prisma } from '@/lib/prisma'
import { subMinutes, format } from 'date-fns'
import type { NodeCurrentMetrics, ActiveReservation } from '@/lib/types/dashboard'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2'] as const
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000   // 2 minutes
const HISTORY_WINDOW_MIN = 30

export async function getCurrentMetrics(nodeId: string): Promise<NodeCurrentMetrics> {
  const since = subMinutes(new Date(), HISTORY_WINDOW_MIN)

  const rows = await prisma.metricsRaw.findMany({
    where: { node_id: nodeId, collected_at: { gte: since } },
    orderBy: { collected_at: 'asc' },
  })

  if (rows.length === 0) {
    return { nodeId, cpu: 0, ram: 0, disk: 0, lastCollectedAt: '', isOnline: false, history: [] }
  }

  const latest = rows[rows.length - 1]
  const isOnline = Date.now() - latest.collected_at.getTime() < OFFLINE_THRESHOLD_MS

  const history = rows.map(r => ({
    timestamp: format(r.collected_at, 'HH:mm'),
    cpu: r.cpu_percent,
    ram: r.ram_percent,
  }))

  return {
    nodeId,
    cpu: latest.cpu_percent,
    ram: latest.ram_percent,
    disk: latest.disk_percent,
    lastCollectedAt: latest.collected_at.toISOString(),
    isOnline,
    history,
  }
}

export async function getAllCurrentMetrics(): Promise<NodeCurrentMetrics[]> {
  return Promise.all(NODES.map(getCurrentMetrics))
}

export async function getActiveReservations(): Promise<ActiveReservation[]> {
  const rows = await prisma.reservation.findMany({
    where: { status: 'active' },
    orderBy: { reserved_at: 'desc' },
  })

  return rows.map(r => ({
    id: r.id,
    nodeId: r.node_id,
    triggeredBy: r.triggered_by as 'automatic' | 'manual',
    cpuReserved: r.cpu_reserved,
    ramReservedGb: r.ram_reserved_gb,
    reservedAt: r.reserved_at.toISOString(),
    expiresAt: r.expires_at?.toISOString() ?? null,
    notes: r.notes,
  }))
}
```

- [ ] **Step 4: Installer date-fns si absent**

```bash
npm install date-fns
```

- [ ] **Step 5: Lancer les tests**

```bash
npx jest tests/lib/dashboard-data.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard-data.ts lib/types/dashboard.ts tests/lib/dashboard-data.test.ts
git commit --author="jibé <jibe@metrics-app>" -m "feat: couche données dashboard — getCurrentMetrics + getActiveReservations

Fonctions Prisma pour le dashboard :
- getCurrentMetrics(nodeId) : 30 dernières minutes + détection offline (>2min)
- getAllCurrentMetrics() : tous les nœuds en parallèle
- getActiveReservations() : réservations status=active
Tests Jest avec mock Prisma."
```

---

## Task 6: Auth — /api/auth/login + middleware + page login

**Files:**
- Create: `app/api/auth/login/route.ts`
- Modify: `middleware.ts`
- Create: `app/login/page.tsx`

- [ ] **Step 1: Créer /api/auth/login — pose le cookie httpOnly**

Créer `app/api/auth/login/route.ts` :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { signJWT } from '@/lib/auth'

// POST /api/auth/login
// Body: { username: string, password: string }
// Répond avec cookie httpOnly "session" contenant le JWT
export async function POST(req: NextRequest) {
  let body: unknown
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { username, password } = body as { username?: string; password?: string }

  const adminUser = process.env.ADMIN_USERNAME
  const adminPass = process.env.ADMIN_PASSWORD

  if (!adminUser || !adminPass) {
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  if (username !== adminUser || password !== adminPass) {
    return NextResponse.json({ error: 'Identifiants incorrects' }, { status: 401 })
  }

  const token = await signJWT({ sub: username, role: 'admin' }, 86400) // 24h

  const res = NextResponse.json({ ok: true })
  res.cookies.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  })
  return res
}
```

- [ ] **Step 2: Mettre à jour middleware.ts**

Le middleware doit :
1. Protéger `/dashboard/*` : vérifier le cookie `session`
2. Pour les routes API protégées : accepter Bearer token OU cookie `session`

Remplacer le contenu de `middleware.ts` par :

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT } from '@/lib/auth'
import { checkRateLimit } from '@/lib/rate-limit'

const API_PROTECTED = ['/api/reserve', '/api/release', '/api/predict', '/api/forecast']

async function extractJWT(req: NextRequest): Promise<string | null> {
  // Bearer token (Authorization header)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7)
  // Cookie httpOnly session
  const cookie = req.cookies.get('session')
  if (cookie?.value) return cookie.value
  return null
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rate limiting sur toutes les routes /api
  if (pathname.startsWith('/api')) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? req.headers.get('x-real-ip')
      ?? 'unknown'
    const rl = checkRateLimit(ip)

    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: {
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(rl.resetAt / 1000)),
        }},
      )
    }
  }

  // Protection dashboard : cookie session obligatoire
  if (pathname.startsWith('/dashboard')) {
    const token = req.cookies.get('session')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    try {
      await verifyJWT(token)
    } catch {
      const res = NextResponse.redirect(new URL('/login', req.url))
      res.cookies.delete('session')
      return res
    }
  }

  // Protection API : Bearer token OU cookie session
  if (API_PROTECTED.some(p => pathname.startsWith(p))) {
    const token = await extractJWT(req)
    if (!token) {
      return NextResponse.json({ error: 'Authorization manquante' }, { status: 401 })
    }
    try {
      await verifyJWT(token)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Invalid token'
      return NextResponse.json({ error: message }, { status: 401 })
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*'],
}
```

- [ ] **Step 3: Créer la page login**

Créer `app/login/page.tsx` :

```typescript
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
```

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/login/route.ts middleware.ts app/login/page.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: auth cookie session — login + middleware dashboard (PRV-34)

POST /api/auth/login : pose un cookie httpOnly 'session' (JWT 24h).
middleware.ts : protège /dashboard/* via cookie session,
accepte Bearer OU cookie session sur les routes API protégées
(permet aux Client Components d'appeler /api/forecast sans gérer le token manuellement).
Page /login : formulaire dark theme, feedback d'erreur inline."
```

---

## Task 7: Layout — Sidebar + Header + dashboard/layout.tsx

**Files:**
- Create: `components/layout/Sidebar.tsx`
- Create: `components/layout/Header.tsx`
- Create: `app/dashboard/layout.tsx`

- [ ] **Step 1: Créer Sidebar**

Créer `components/layout/Sidebar.tsx` :

```typescript
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
```

- [ ] **Step 2: Créer Header**

Créer `components/layout/Header.tsx` :

```typescript
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
```

- [ ] **Step 3: Créer /api/auth/logout**

Créer `app/api/auth/logout/route.ts` :

```typescript
import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete('session')
  return res
}
```

- [ ] **Step 4: Créer dashboard/layout.tsx**

Créer `app/dashboard/layout.tsx` :

```typescript
import Sidebar from '@/components/layout/Sidebar'

// Le middleware garantit que seuls les utilisateurs authentifiés arrivent ici
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/layout/Sidebar.tsx components/layout/Header.tsx \
        app/dashboard/layout.tsx app/api/auth/logout/route.ts
git commit --author="jibé <jibe@metrics-app>" -m "feat: layout dashboard — Sidebar + Header + layout.tsx

Sidebar : navigation fixe (Charge actuelle / Prédictions / Réservations),
lien actif en bleu, liste des nœuds en pied de sidebar.
Header : titre de page + bouton déconnexion (DELETE cookie session).
layout.tsx : wrapper flex — sidebar fixe + main scrollable.
Le middleware gère l'auth, le layout ne refait pas cette vérification."
```

---

## Task 8: NodeCard + page Charge actuelle (PRV-46)

**Files:**
- Create: `components/ui/NodeCard.tsx`
- Create: `tests/components/NodeCard.test.tsx`
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Écrire le test NodeCard (doit échouer)**

Créer `tests/components/NodeCard.test.tsx` :

```typescript
import { render, screen } from '@testing-library/react'
import NodeCard from '@/components/ui/NodeCard'
import type { NodeCurrentMetrics } from '@/lib/types/dashboard'

const mockNode: NodeCurrentMetrics = {
  nodeId: 'k8s-worker-1',
  cpu: 45.5,
  ram: 62.3,
  disk: 30.0,
  lastCollectedAt: new Date().toISOString(),
  isOnline: true,
  history: [],
}

describe('NodeCard', () => {
  it('affiche le nom du nœud', () => {
    render(<NodeCard metrics={mockNode} />)
    expect(screen.getByText('k8s-worker-1')).toBeTruthy()
  })

  it('affiche les valeurs CPU et RAM', () => {
    render(<NodeCard metrics={mockNode} />)
    expect(screen.getByText(/45\.5/)).toBeTruthy()
    expect(screen.getByText(/62\.3/)).toBeTruthy()
  })

  it('affiche "Hors ligne" si isOnline est false', () => {
    render(<NodeCard metrics={{ ...mockNode, isOnline: false }} />)
    expect(screen.getByText('Hors ligne')).toBeTruthy()
  })

  it('affiche "En ligne" si isOnline est true', () => {
    render(<NodeCard metrics={mockNode} />)
    expect(screen.getByText('En ligne')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
npx jest tests/components/NodeCard.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Implémenter NodeCard**

Créer `components/ui/NodeCard.tsx` :

```typescript
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
```

- [ ] **Step 4: Lancer les tests**

```bash
npx jest tests/components/NodeCard.test.tsx
```

Expected: PASS (4 tests)

- [ ] **Step 5: Créer la page charge actuelle**

Créer `app/dashboard/page.tsx` :

```typescript
import { getAllCurrentMetrics } from '@/lib/dashboard-data'
import NodeCard from '@/components/ui/NodeCard'
import Header from '@/components/layout/Header'

export const revalidate = 30   // revalider toutes les 30s (Next.js ISR)

export default async function DashboardPage() {
  const metrics = await getAllCurrentMetrics()

  const onlineCount = metrics.filter(m => m.isOnline).length

  return (
    <div className="flex flex-col h-full">
      <Header title="Charge actuelle" />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-gray-400 text-sm">
            {onlineCount}/{metrics.length} nœuds en ligne — actualisation toutes les 30s
          </p>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {metrics.map(m => (
            <NodeCard key={m.nodeId} metrics={m} />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/ui/NodeCard.tsx tests/components/NodeCard.test.tsx \
        app/dashboard/page.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: NodeCard + page charge actuelle (PRV-46)

NodeCard : carte par nœud avec barres CPU/RAM/Disk, bordure colorée
selon charge (vert < seuil / orange warning / rouge critique),
badge En ligne / Hors ligne (timeout 2min sans collecte).
Page /dashboard : grille 3 colonnes (1 par nœud), revalidate=30s ISR."
```

---

## Task 9: Page Prédictions (PRV-47)

**Files:**
- Create: `app/dashboard/predictions/page.tsx`

- [ ] **Step 1: Créer la page prédictions**

Créer `app/dashboard/predictions/page.tsx` :

```typescript
import Header from '@/components/layout/Header'
import ForecastPanel from '@/components/charts/ForecastPanel'

export default function PredictionsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Charge prédite" />
      <div className="p-6">
        <p className="text-gray-400 text-sm mb-6">
          Prévisions CPU/RAM à 30 minutes par nœud — modèle qwen2:0.5b via prediction-service.
        </p>
        <ForecastPanel />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/predictions/page.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: page prédictions /dashboard/predictions (PRV-47)

Page prédictions : délègue à ForecastPanel (Client Component) qui
appelle POST /api/forecast pour chaque nœud (cookie session envoyé
automatiquement par le navigateur, pas besoin de gérer le token).
ForecastChart par nœud avec gradient coloré selon niveau de risque."
```

---

## Task 10: ReservationCard + page Réservations (PRV-48 + PRV-49)

**Files:**
- Create: `components/ui/ReservationCard.tsx`
- Create: `app/dashboard/reservations/page.tsx`

- [ ] **Step 1: Créer ReservationCard**

Créer `components/ui/ReservationCard.tsx` :

```typescript
import type { ActiveReservation } from '@/lib/types/dashboard'
import StatusBadge from './StatusBadge'

interface ReservationCardProps {
  reservation: ActiveReservation
}

function formatDuration(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now()
  if (diff <= 0) return 'Expiré'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}min` : `${m}min`
}

export default function ReservationCard({ reservation }: ReservationCardProps) {
  const { nodeId, triggeredBy, cpuReserved, ramReservedGb, reservedAt, expiresAt, notes } = reservation

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-gray-100 font-medium text-sm">{nodeId}</h3>
          <p className="text-gray-500 text-xs mt-0.5">
            Depuis {new Date(reservedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <StatusBadge level="active" label={triggeredBy === 'manual' ? 'Manuelle' : 'Automatique'} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-gray-500 text-xs">CPU réservé</p>
          <p className="text-gray-100 font-medium">{cpuReserved} cores</p>
        </div>
        <div className="bg-gray-900 rounded-lg p-2">
          <p className="text-gray-500 text-xs">RAM réservée</p>
          <p className="text-gray-100 font-medium">{ramReservedGb} GB</p>
        </div>
      </div>

      {expiresAt && (
        <p className="text-xs text-gray-500 mt-3">
          Expire dans : <span className="text-yellow-400">{formatDuration(expiresAt)}</span>
        </p>
      )}

      {notes && (
        <p className="text-xs text-gray-500 mt-2 italic">Note : {notes}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Créer la page réservations (actives + formulaire)**

Créer `app/dashboard/reservations/page.tsx` :

```typescript
import { getActiveReservations } from '@/lib/dashboard-data'
import ReservationCard from '@/components/ui/ReservationCard'
import Header from '@/components/layout/Header'
import ReservationForm from './ReservationForm'

export const revalidate = 30

export default async function ReservationsPage() {
  const reservations = await getActiveReservations()

  return (
    <div className="flex flex-col h-full">
      <Header title="Réservations" />
      <div className="p-6 space-y-8">

        {/* Réservations actives — PRV-48 */}
        <section>
          <h2 className="text-gray-300 font-semibold mb-4">
            Réservations actives
            <span className="ml-2 text-xs font-normal text-gray-500">({reservations.length})</span>
          </h2>
          {reservations.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucune réservation active.</p>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {reservations.map(r => (
                <ReservationCard key={r.id} reservation={r} />
              ))}
            </div>
          )}
        </section>

        {/* Formulaire réservation manuelle — PRV-49 */}
        <section>
          <h2 className="text-gray-300 font-semibold mb-4">Réservation manuelle</h2>
          <ReservationForm />
        </section>

      </div>
    </div>
  )
}
```

- [ ] **Step 3: Créer ReservationForm (Client Component)**

Créer `app/dashboard/reservations/ReservationForm.tsx` :

```typescript
'use client'

import { useState, FormEvent } from 'react'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']

export default function ReservationForm() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)

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
      ram_gb_per_replica: parseFloat(form.get('ram_gb_per_replica') as string),
      replicas:         parseInt(form.get('replicas') as string, 10),
      duration_minutes: parseInt(form.get('duration_minutes') as string, 10),
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
        setMessage(`Réservation créée — ID : ${data.reservation?.id ?? '?'}`)
        ;(e.target as HTMLFormElement).reset()
      }
    } catch {
      setStatus('error')
      setMessage('Impossible de contacter le serveur')
    }
  }

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
          <label className="block text-xs text-gray-400 mb-1">Deployment</label>
          <input name="deployment_name" type="text" required placeholder="ex: mon-app"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Namespace</label>
          <input name="namespace" type="text" required defaultValue="default"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">CPU / replica (cores)</label>
          <input name="cpu_per_replica" type="number" step="0.1" min="0.1" required defaultValue="0.5"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">RAM / replica (GB)</label>
          <input name="ram_gb_per_replica" type="number" step="0.1" min="0.1" required defaultValue="1"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Réplicas</label>
          <input name="replicas" type="number" min="1" max="10" required defaultValue="1"
            className="w-full bg-gray-700 text-gray-100 rounded-lg px-3 py-2 text-sm border border-gray-600 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Durée (minutes)</label>
          <input name="duration_minutes" type="number" min="5" max="1440" required defaultValue="60"
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

      <button type="submit" disabled={status === 'loading'}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium transition-colors">
        {status === 'loading' ? 'Réservation en cours…' : 'Réserver les ressources'}
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/ui/ReservationCard.tsx \
        app/dashboard/reservations/page.tsx \
        app/dashboard/reservations/ReservationForm.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: réservations actives + formulaire manuel (PRV-48 + PRV-49)

ReservationCard : carte par réservation active (nœud, CPU/RAM réservés,
déclencheur auto/manuel, countdown expiration).
Page /dashboard/reservations : liste des actives (Prisma, revalidate=30s)
+ formulaire réservation manuelle (Client Component).
Formulaire appelle POST /api/reserve via cookie session — feedback inline succès/erreur."
```

---

## Vérification finale

- [ ] **Lancer tous les tests**

```bash
npx jest
```

Expected: PASS — dashboard-data (5 tests) + StatusBadge (4) + NodeCard (4)

- [ ] **Build de vérification**

```bash
npm run build
```

Expected: pas d'erreur TypeScript ni de build failure.

- [ ] **Commit final si build OK**

```bash
git commit --allow-empty --author="jibé <jibe@metrics-app>" -m "chore: dashboard PRV-46/47/48/49/50 — build vérifié, tous les tests passent"
```
