# LLM Drawer — Affichage Prompt & Réponse IA

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher dans un drawer latéral, sur la page Prédictions, le prompt envoyé à Ollama et la réponse brute de l'IA pour chaque step de prédiction — avec une phrase de raisonnement visible.

**Architecture:** Le prediction-service enrichit le prompt pour demander une phrase de raisonnement avant le JSON, capture la réponse brute à chaque step, et la retourne dans `/forecast`. Le Next.js API route passe `raw_steps` au client. ForecastPanel ouvre un `LLMDrawer` au clic.

**Tech Stack:** Node.js (prediction-service), TypeScript/Next.js, Zod, React, Tailwind CSS, Jest + React Testing Library, kubectl (déploiement ConfigMap)

---

## Fichiers touchés

| Fichier | Action |
|---------|--------|
| `lib/types/dashboard.ts` | Modifier — ajout `LLMStep` + `llm_steps` dans `NodeForecast` |
| `lib/validators/forecast-response.ts` | Modifier — `raw_steps` optionnel dans les deux schemas |
| `prediction-service-fix/index.js` | Modifier — prompt enrichi + capture raw + retour `raw_steps` |
| `app/api/forecast/route.ts` | Modifier — passe `raw_steps` dans la réponse JSON |
| `components/ui/LLMDrawer.tsx` | Créer — drawer latéral prompt/réponse |
| `tests/components/LLMDrawer.test.tsx` | Créer — tests unitaires LLMDrawer |
| `components/charts/ForecastPanel.tsx` | Modifier — state drawer + bouton + rendu LLMDrawer |

---

## Task 1 — Types : `LLMStep` + `llm_steps` dans `NodeForecast`

**Files:**
- Modify: `lib/types/dashboard.ts`

- [ ] **Ajouter l'interface `LLMStep` et le champ `llm_steps` dans `NodeForecast`**

Ouvrir `lib/types/dashboard.ts`. Ajouter après `ForecastStep` :

```ts
export interface LLMStep {
  step: number    // numéro du pas (1..N)
  prompt: string  // prompt envoyé à Ollama
  raw: string     // réponse brute (raisonnement + JSON)
}
```

Ajouter `llm_steps` dans `NodeForecast` :

```ts
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
  llm_steps?: LLMStep[]   // ← nouveau
}
```

- [ ] **Vérifier que TypeScript compile sans erreur**

```bash
cd /Users/jean-baptiste/Desktop/metrics-app
npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur sur `lib/types/dashboard.ts`.

- [ ] **Commit**

```bash
git add lib/types/dashboard.ts
git commit --author="jibé <jibe@metrics-app>" -m "feat: type LLMStep + llm_steps dans NodeForecast"
```

---

## Task 2 — Schemas Zod : `raw_steps` optionnel

**Files:**
- Modify: `lib/validators/forecast-response.ts`

- [ ] **Ajouter `LLMStepSchema` et `raw_steps` dans `ForecastServiceResponseSchema` et `ForecastOutputSchema`**

Ouvrir `lib/validators/forecast-response.ts`. Ajouter après les imports :

```ts
export const LLMStepSchema = z.object({
  step: z.number().int().min(1),
  prompt: z.string(),
  raw: z.string(),
})
```

Ajouter `raw_steps` dans `ForecastServiceResponseSchema` (champ optionnel pour compatibilité si le service n'est pas encore redéployé) :

```ts
export const ForecastServiceResponseSchema = z.object({
  node: z.string(),
  forecast: z.array(ForecastStepSchema).min(1),
  cpu_avg: z.number().min(0).max(100),
  cpu_peak: z.number().min(0).max(100),
  ram_avg: z.number().min(0).max(100),
  ram_peak: z.number().min(0).max(100),
  model_used: z.string(),
  timestamp: z.string(),
  raw_steps: z.array(LLMStepSchema).optional(),   // ← nouveau
})
```

Ajouter `raw_steps` dans `ForecastOutputSchema` :

```ts
export const ForecastOutputSchema = z.object({
  prediction_id: z.string(),
  node_id: z.string(),
  horizon_minutes: z.number(),
  step_minutes: z.number(),
  forecast: z.array(ForecastStepSchema),
  summary: z.object({
    cpu_avg: z.number(),
    cpu_peak: z.number(),
    ram_avg: z.number(),
    ram_peak: z.number(),
  }),
  risk_assessment: RiskAssessmentSchema,
  model_used: z.string(),
  history: z.object({
    points_used: z.number(),
    oldest: z.coerce.date(),
    newest: z.coerce.date(),
  }),
  raw_steps: z.array(LLMStepSchema).optional(),   // ← nouveau
})
```

- [ ] **Vérifier compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Commit**

```bash
git add lib/validators/forecast-response.ts
git commit --author="jibé <jibe@metrics-app>" -m "feat: raw_steps optionnel dans ForecastServiceResponseSchema et ForecastOutputSchema"
```

---

## Task 3 — prediction-service : prompt enrichi + capture raw

**Files:**
- Modify: `prediction-service-fix/index.js`

- [ ] **Modifier `buildStepPrompt` pour demander un raisonnement**

Remplacer la fonction `buildStepPrompt` (ligne ~55) par :

```js
function buildStepPrompt(node, cpuHistory, ramHistory, stepMinutes) {
  const cpuStr = cpuHistory.map((v,i) => `t-${(cpuHistory.length-i)*stepMinutes}min: ${v}%`).join(', ');
  const ramStr = ramHistory.map((v,i) => `t-${(ramHistory.length-i)*stepMinutes}min: ${v}%`).join(', ');
  return `Node "${node}". CPU history: ${cpuStr}. RAM history: ${ramStr}. Identify the trend in one sentence, then reply with JSON {"cpu_percent": <0-100>, "ram_percent": <0-100>}`;
}
```

- [ ] **Modifier `generateForecast` pour capturer les réponses brutes**

Remplacer la fonction `generateForecast` (ligne ~65) par :

```js
async function generateForecast(node, cpuHistory, ramHistory, horizonMinutes, stepMinutes) {
  const steps = Math.max(1, Math.round(horizonMinutes / stepMinutes));
  const forecast = [];
  const raw_steps = [];
  let cpu = [...cpuHistory];
  let ram = [...ramHistory];
  for (let i = 1; i <= steps; i++) {
    let cpuVal = clamp(cpu[cpu.length-1]);
    let ramVal = clamp(ram[ram.length-1]);
    const prompt = buildStepPrompt(node, cpu, ram, stepMinutes);
    let rawResponse = '';
    try {
      rawResponse = await callOllama(prompt);
      const match = rawResponse.match(/\{[\s\S]*?\}/);
      if (match) {
        const p = JSON.parse(match[0]);
        if (p.cpu_percent != null) cpuVal = clamp(p.cpu_percent);
        if (p.ram_percent != null) ramVal = clamp(p.ram_percent);
      }
    } catch (_) {}
    raw_steps.push({ step: i, prompt, raw: rawResponse });
    forecast.push({ t: `+${i * stepMinutes}min`, cpu_percent: parseFloat(cpuVal.toFixed(1)), ram_percent: parseFloat(ramVal.toFixed(1)) });
    cpu = [...cpu.slice(1), cpuVal];
    ram = [...ram.slice(1), ramVal];
  }
  const cpuVals = forecast.map(f => f.cpu_percent);
  const ramVals = forecast.map(f => f.ram_percent);
  return {
    forecast,
    raw_steps,
    cpu_avg:  parseFloat((cpuVals.reduce((a,b)=>a+b,0)/cpuVals.length).toFixed(1)),
    cpu_peak: parseFloat(clamp(Math.max(...cpuVals)).toFixed(1)),
    ram_avg:  parseFloat((ramVals.reduce((a,b)=>a+b,0)/ramVals.length).toFixed(1)),
    ram_peak: parseFloat(clamp(Math.max(...ramVals)).toFixed(1))
  };
}
```

- [ ] **Modifier la route `/forecast` pour inclure `raw_steps` dans la réponse**

Dans la route `app.post('/forecast', ...)`, modifier le `return res.json(...)` :

```js
return res.json({
  node,
  forecast: result.forecast,
  raw_steps: result.raw_steps,   // ← nouveau
  cpu_avg: result.cpu_avg,
  cpu_peak: result.cpu_peak,
  ram_avg: result.ram_avg,
  ram_peak: result.ram_peak,
  model_used: MODEL,
  timestamp: new Date().toISOString()
});
```

- [ ] **Commit**

```bash
git add prediction-service-fix/index.js
git commit --author="jibé <jibe@metrics-app>" -m "feat: prompt enrichi (raisonnement) + raw_steps dans /forecast"
```

---

## Task 4 — API route : passer `raw_steps` au client

**Files:**
- Modify: `app/api/forecast/route.ts`

- [ ] **Ajouter `raw_steps` dans la réponse JSON de la route**

Dans `app/api/forecast/route.ts`, step 7 (le `return NextResponse.json(...)`), ajouter `raw_steps` :

```ts
return NextResponse.json(
  {
    prediction_id: saved.id,
    node_id,
    horizon_minutes,
    step_minutes,
    forecast: forecastResult.forecast,
    summary: {
      cpu_avg: forecastResult.cpu_avg,
      cpu_peak: forecastResult.cpu_peak,
      ram_avg: forecastResult.ram_avg,
      ram_peak: forecastResult.ram_peak,
    },
    risk_assessment: riskAssessment,
    model_used: forecastResult.model_used,
    history: {
      points_used: rawMetrics.length,
      oldest: rawMetrics[0].collected_at,
      newest: rawMetrics[rawMetrics.length - 1].collected_at,
    },
    raw_steps: forecastResult.raw_steps ?? [],   // ← nouveau
  },
  { status: 201 },
)
```

- [ ] **Vérifier compilation**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Commit**

```bash
git add app/api/forecast/route.ts
git commit --author="jibé <jibe@metrics-app>" -m "feat: raw_steps exposé dans la réponse /api/forecast"
```

---

## Task 5 — Composant `LLMDrawer` + tests

**Files:**
- Create: `components/ui/LLMDrawer.tsx`
- Create: `tests/components/LLMDrawer.test.tsx`

- [ ] **Écrire le test en premier (TDD)**

Créer `tests/components/LLMDrawer.test.tsx` :

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import LLMDrawer from '@/components/ui/LLMDrawer'
import type { LLMStep } from '@/lib/types/dashboard'

const mockSteps: LLMStep[] = [
  {
    step: 1,
    prompt: 'Node "k8s-worker-1". CPU history: t-30min: 48%, t-25min: 51%.',
    raw: 'CPU shows an upward trend. {"cpu_percent": 71, "ram_percent": 74}',
  },
  {
    step: 2,
    prompt: 'Node "k8s-worker-1". CPU history: t-25min: 51%, t-20min: 55%.',
    raw: '{"cpu_percent": 73, "ram_percent": 75}',
  },
]

describe('LLMDrawer', () => {
  it('affiche le nodeId dans le titre', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={() => {}} />)
    expect(screen.getByText(/k8s-worker-1/)).toBeInTheDocument()
  })

  it('affiche un bloc Prompt et Réponse par step', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={() => {}} />)
    expect(screen.getAllByText(/Prompt →/)).toHaveLength(2)
    expect(screen.getAllByText(/Réponse brute ←/)).toHaveLength(2)
  })

  it('affiche le contenu du prompt et de la réponse brute', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={() => {}} />)
    expect(screen.getByText(/CPU shows an upward trend/)).toBeInTheDocument()
  })

  it('appelle onClose au clic sur le bouton fermer', () => {
    const onClose = jest.fn()
    render(<LLMDrawer nodeId="k8s-worker-1" steps={mockSteps} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Fermer le drawer'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('affiche un message si steps est vide', () => {
    render(<LLMDrawer nodeId="k8s-worker-1" steps={[]} onClose={() => {}} />)
    expect(screen.getByText(/Aucune donnée disponible/)).toBeInTheDocument()
  })
})
```

- [ ] **Lancer les tests pour vérifier qu'ils échouent**

```bash
npx jest tests/components/LLMDrawer.test.tsx --no-coverage 2>&1 | tail -20
```

Attendu : `Cannot find module '@/components/ui/LLMDrawer'`

- [ ] **Créer le composant `LLMDrawer`**

Créer `components/ui/LLMDrawer.tsx` :

```tsx
'use client'

import type { LLMStep } from '@/lib/types/dashboard'

interface LLMDrawerProps {
  nodeId: string
  steps: LLMStep[]
  onClose: () => void
}

export default function LLMDrawer({ nodeId, steps, onClose }: LLMDrawerProps) {
  return (
    <div className="w-72 bg-gray-900 border border-gray-700 rounded-lg p-3 flex-shrink-0 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          🤖 Dialogue IA — {nodeId}
        </span>
        <button
          onClick={onClose}
          aria-label="Fermer le drawer"
          className="text-gray-600 hover:text-gray-300 text-sm leading-none"
        >
          ✕
        </button>
      </div>

      {steps.length === 0 ? (
        <p className="text-xs text-gray-600">Aucune donnée disponible.</p>
      ) : (
        <div className="space-y-4 overflow-y-auto max-h-[480px]">
          {steps.map(s => (
            <div key={s.step}>
              <p className="text-xs text-gray-600 uppercase tracking-wider mb-1 font-semibold">
                Step {s.step}/{steps.length} (+{s.step * 5}min)
              </p>

              <p className="text-xs text-gray-500 font-bold mb-1">Prompt →</p>
              <pre className="text-xs font-mono text-green-300 bg-black rounded p-2 whitespace-pre-wrap break-all border border-gray-800 leading-relaxed">
                {s.prompt}
              </pre>

              <p className="text-xs text-gray-500 font-bold mt-2 mb-1">Réponse brute ←</p>
              <pre className="text-xs font-mono text-yellow-300 bg-black rounded p-2 whitespace-pre-wrap break-all border border-gray-800 leading-relaxed">
                {s.raw || '(vide)'}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Lancer les tests pour vérifier qu'ils passent**

```bash
npx jest tests/components/LLMDrawer.test.tsx --no-coverage 2>&1 | tail -20
```

Attendu : `5 passed, 5 total`

- [ ] **Commit**

```bash
git add components/ui/LLMDrawer.tsx tests/components/LLMDrawer.test.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: composant LLMDrawer + tests"
```

---

## Task 6 — Intégrer le drawer dans `ForecastPanel`

**Files:**
- Modify: `components/charts/ForecastPanel.tsx`

- [ ] **Mettre à jour `ForecastPanel` pour afficher le drawer**

Remplacer le contenu complet de `components/charts/ForecastPanel.tsx` par :

```tsx
'use client'

import { useEffect, useState } from 'react'
import ForecastChart from './ForecastChart'
import SkeletonCard from '@/components/ui/SkeletonCard'
import StatusBadge from '@/components/ui/StatusBadge'
import LLMDrawer from '@/components/ui/LLMDrawer'
import type { NodeForecast } from '@/lib/types/dashboard'

const NODES = ['k8s-master', 'k8s-worker-1', 'k8s-worker-2']

export default function ForecastPanel() {
  const [forecasts, setForecasts] = useState<NodeForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openDrawer, setOpenDrawer] = useState<string | null>(null)

  useEffect(() => {
    async function fetchForecasts() {
      try {
        const results: NodeForecast[] = []
        for (const nodeId of NODES) {
          const res = await fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ node_id: nodeId, horizon_minutes: 30, step_minutes: 5 }),
          })
          if (!res.ok) throw new Error(`Forecast échoué pour ${nodeId}: ${res.status}`)
          const data = await res.json()
          const cpuPeak = data.summary?.cpu_peak ?? data.cpu_peak ?? 0
          const riskLevel: 'low' | 'medium' | 'high' =
            cpuPeak >= 90 ? 'high' : cpuPeak >= 70 ? 'medium' : 'low'
          results.push({
            nodeId,
            forecast: data.forecast ?? [],
            cpu_avg: data.summary?.cpu_avg ?? 0,
            cpu_peak: cpuPeak,
            ram_avg: data.summary?.ram_avg ?? 0,
            ram_peak: data.summary?.ram_peak ?? 0,
            model_used: data.model_used ?? 'unknown',
            timestamp: data.predicted_at ?? new Date().toISOString(),
            riskLevel,
            llm_steps: data.raw_steps ?? [],   // ← nouveau
          } as NodeForecast)
        }
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
    <div className="flex flex-col gap-6">
      {forecasts.map(f => (
        <div key={f.nodeId} className="flex gap-3 items-start">
          {/* Carte nœud */}
          <div className="flex-1 bg-gray-800 rounded-lg p-4">
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
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">Modèle: {f.model_used} — {new Date(f.timestamp).toLocaleTimeString('fr-FR')}</p>
              {(f.llm_steps?.length ?? 0) > 0 && (
                <button
                  onClick={() => setOpenDrawer(openDrawer === f.nodeId ? null : f.nodeId)}
                  className="text-xs text-gray-500 hover:text-blue-400 transition-colors border border-gray-700 hover:border-blue-600 rounded px-2 py-1"
                >
                  🤖 {openDrawer === f.nodeId ? 'Masquer' : 'Voir'} prompt & réponse IA
                </button>
              )}
            </div>
          </div>

          {/* Drawer latéral */}
          {openDrawer === f.nodeId && f.llm_steps && (
            <LLMDrawer
              nodeId={f.nodeId}
              steps={f.llm_steps}
              onClose={() => setOpenDrawer(null)}
            />
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Vérifier compilation TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Attendu : aucune erreur.

- [ ] **Lancer tous les tests**

```bash
npx jest --no-coverage 2>&1 | tail -20
```

Attendu : tous les tests passent.

- [ ] **Commit**

```bash
git add components/charts/ForecastPanel.tsx
git commit --author="jibé <jibe@metrics-app>" -m "feat: intégration LLMDrawer dans ForecastPanel"
```

---

## Task 7 — Déploiement ConfigMap sur K8s

**Files:**
- `prediction-service-fix/index.js` (déjà modifié en Task 3)
- ConfigMap K8s : `prediction-service-index` (namespace `ai-module`)

- [ ] **Copier le fichier modifié sur le master K8s**

```bash
scp /Users/jean-baptiste/Desktop/metrics-app/prediction-service-fix/index.js \
  romain@192.168.10.213:/tmp/index.js
```

Mot de passe SSH : `romain1234`

- [ ] **Appliquer le nouveau ConfigMap sur le cluster**

```bash
ssh romain@192.168.10.213 "kubectl create configmap prediction-service-index \
  --from-file=index.js=/tmp/index.js \
  -n ai-module \
  --dry-run=client -o yaml | kubectl apply -f -"
```

- [ ] **Redémarrer le pod prediction-service**

```bash
ssh romain@192.168.10.213 "kubectl rollout restart deployment prediction-service -n ai-module"
```

- [ ] **Vérifier que le pod redémarre correctement**

```bash
ssh romain@192.168.10.213 "kubectl rollout status deployment prediction-service -n ai-module --timeout=60s"
```

Attendu : `deployment "prediction-service" successfully rolled out`

- [ ] **Tester manuellement que le nouveau prompt génère du raisonnement**

```bash
ssh romain@192.168.10.213 "kubectl exec -n ai-module \
  \$(kubectl get pod -n ai-module -l app=prediction-service -o jsonpath='{.items[0].metadata.name}') \
  -- node -e \"
const r = require('http');
const d = JSON.stringify({node:'k8s-worker-1',horizon_minutes:10,step_minutes:5});
const req = r.request({host:'localhost',port:3001,path:'/forecast',method:'POST',headers:{'Content-Type':'application/json','Content-Length':d.length}},res=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{const j=JSON.parse(b);console.log('raw step 1:',j.raw_steps?.[0]?.raw);});});
req.write(d);req.end();
\""
```

Attendu : une ligne avec le raisonnement + JSON, ex : `CPU shows upward trend. {"cpu_percent": 68, "ram_percent": 72}`

- [ ] **Commit final**

```bash
git add prediction-service-fix/index.js
git commit --author="jibé <jibe@metrics-app>" -m "deploy: ConfigMap prediction-service-index mis à jour (prompt enrichi)"
```
