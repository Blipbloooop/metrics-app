# Spec — Drawer "Dialogue IA" sur la page Prédictions

**Date :** 2026-05-15
**Motivation :** Le prof demande d'expliquer pourquoi on utilise un LLM plutôt qu'un réseau de neurones classique. Afficher le prompt envoyé et la réponse brute de l'IA directement dans le dashboard rend ce choix visible et démontrable en démo.

---

## Vue d'ensemble

Sur la page `/dashboard/predictions`, chaque carte nœud reçoit un bouton **"🤖 Voir prompt & réponse IA"**. Un clic ouvre un panneau latéral (drawer) à droite de la carte, qui affiche le log complet des échanges avec Ollama : prompt envoyé + réponse brute pour chacun des 6 steps de prédiction.

Le LLM est modifié pour produire **une phrase de raisonnement** avant le JSON — ce qui justifie concrètement le choix LLM vs réseau de neurones lors de la démo.

---

## Modifications

### 1. `prediction-service-fix/index.js` — prompt enrichi + retour raw

**`buildStepPrompt`** — ajout d'une instruction de raisonnement :

```
Node "${node}". CPU history: ${cpuStr}. RAM history: ${ramStr}.
Identify the trend in one sentence, then reply with JSON {"cpu_percent": <0-100>, "ram_percent": <0-100>}
```

Le modèle `qwen2:0.5b` avec `num_predict: 256` peut produire ~1 phrase + JSON en ~30 tokens. Fiable à `temperature: 0.1`.

**`generateForecast`** — capturer la réponse brute (`raw`) à chaque step et la retourner dans le résultat :

```js
// Nouveau champ dans le retour de generateForecast
raw_steps: [{ step: 1, prompt: "...", raw: "CPU shows upward trend. {\"cpu_percent\":71,...}" }, ...]
```

**Route `/forecast`** — inclure `raw_steps` dans le JSON de réponse.

**Déploiement :** mise à jour du ConfigMap K8s uniquement (`kubectl apply`), pas de rebuild d'image.

---

### 2. `lib/types/dashboard.ts` — nouveau type `LLMStep`

```ts
export interface LLMStep {
  step: number        // 1..N
  prompt: string      // prompt envoyé à Ollama
  raw: string         // réponse brute (raisonnement + JSON)
}

// Ajout dans NodeForecast :
llm_steps?: LLMStep[]
```

---

### 3. `components/ui/LLMDrawer.tsx` — nouveau composant

Composant client `'use client'`. Props :

```ts
interface LLMDrawerProps {
  nodeId: string
  steps: LLMStep[]
  onClose: () => void
}
```

Rendu : panneau 300px fixe à droite de la carte, fond `gray-900`, bordure `gray-700`. Scrollable si les steps dépassent. Pour chaque step :
- Label `Step N/6 (+Nmin)`
- Bloc prompt (fond noir, texte vert `#86efac`, monospace)
- Bloc réponse brute (fond noir, texte jaune `#fbbf24`, monospace)

---

### 4. `components/charts/ForecastPanel.tsx` — intégration drawer

- Stocker `llm_steps` dans le state `NodeForecast` après fetch
- `openDrawer: string | null` state pour savoir quel nœud a le drawer ouvert
- Bouton **"🤖 Voir prompt & réponse IA"** sous chaque carte (apparaît seulement si `llm_steps` présent)
- Afficher `<LLMDrawer>` à côté de la carte concernée

---

## Data flow

```
Ollama (qwen2:0.5b)
  ↑ prompt enrichi (1 phrase + JSON)
  ↓ raw: "CPU trend rising. {"cpu_percent":71,...}"

prediction-service /forecast
  → raw_steps: [{step, prompt, raw}]

Next.js /api/forecast
  → passe raw_steps tel quel dans la réponse

ForecastPanel (client)
  → stocke llm_steps dans NodeForecast state
  → affiche LLMDrawer au clic
```

---

## Ce qui ne change pas

- Extraction du JSON (`raw.match(/\{[\s\S]*?\}/)`) — inchangée, fonctionne même avec du texte avant
- Logique de risque (`assessRisk`) — inchangée
- DB (`prisma.prediction.create`) — inchangée, pas de stockage du raw (volatil, juste pour l'affichage)
- Aucun nouveau endpoint, aucune nouvelle table

---

## Tests

- `tests/components/LLMDrawer.test.tsx` — rendu avec steps, bouton close, cas `steps` vide
- Smoke test manuel : vérifier que `qwen2:0.5b` produit bien du texte avant le JSON avec le nouveau prompt (à valider sur le cluster avant le commit)

---

## Non-objectifs

- Pas de persistance du raw en DB
- Pas d'affichage sur les autres pages
- Pas de modification du prompt `/predict` (seul `/forecast` est concerné)
