# Dashboard Administrateur — Spec Design
> Date : 2026-04-01 | Tickets : PRV-46, PRV-47, PRV-48, PRV-49, PRV-50

---

## Contexte

L'application metrics-app dispose d'un backend complet (API Next.js, PostgreSQL via Prisma, prediction-service Ollama sur K8s). Il n'existe aucune interface utilisateur. Ce spec couvre la création du dashboard administrateur de zéro.

---

## Périmètre

| Ticket | Fonctionnalité | Page |
|--------|---------------|------|
| PRV-50 | Intégration Recharts (remplace Chart.js — meilleur fit React) | Transverse |
| PRV-46 | Visualisation de la charge actuelle | `/dashboard` |
| PRV-47 | Visualisation de la charge prédite | `/dashboard/predictions` |
| PRV-48 | Visualisation des réservations actives | `/dashboard/reservations` |
| PRV-49 | Interface de réservation manuelle | `/dashboard/reservations` |

**Hors périmètre :** PRV-30 (endpoint /reserve non bloquant, déjà partiellement implémenté), alertes (PRV-53–56, sprint suivant).

---

## Architecture

### Structure fichiers

```
app/
  dashboard/
    layout.tsx              # Sidebar + Header persistants (Server Component)
    page.tsx                # Charge actuelle — PRV-46
    predictions/
      page.tsx              # Charge prédite — PRV-47
    reservations/
      page.tsx              # Réservations actives + manuelle — PRV-48 + PRV-49
  login/
    page.tsx                # Page d'auth JWT

components/
  layout/
    Sidebar.tsx             # Navigation latérale
    Header.tsx              # Barre supérieure (titre + logout)
  charts/
    CpuRamChart.tsx         # Recharts LineChart — historique CPU/RAM
    ForecastChart.tsx       # Recharts AreaChart — prédictions avec zone de risque
  ui/
    NodeCard.tsx            # Carte métriques par nœud
    ReservationCard.tsx     # Carte réservation active
    StatusBadge.tsx         # Badge coloré (low/medium/high, active/released…)
    SkeletonCard.tsx        # Loading state skeleton
```

### Nœuds du cluster

Les 3 nœuds sont hardcodés côté validateur Zod : `k8s-master`, `k8s-worker-1`, `k8s-worker-2`. Le dashboard les affiche tous systématiquement.

---

## Data Fetching

### Principe

- **Server Components** pour le rendu initial (appels Prisma directs, pas de round-trip API).
- **`revalidate = 30`** sur la page charge actuelle (Next.js ISR).
- **Client Components** uniquement pour les charts interactifs (Recharts) et le formulaire de réservation.

### Par page

**`/dashboard` (charge actuelle)**
```ts
// Prisma — 30 dernières minutes, toutes les minutes, par nœud
prisma.metricsRaw.findMany({
  where: { collected_at: { gte: subMinutes(now, 30) } },
  orderBy: { collected_at: 'asc' },
  include: { node: true }
})
```

**`/dashboard/predictions`**
```ts
// Appel POST /api/forecast pour chaque nœud (horizon 30min, step 5min)
// + dernière prédiction en DB pour le risque actuel
prisma.predictions.findFirst({
  where: { node_id: nodeId },
  orderBy: { predicted_at: 'desc' }
})
```

**`/dashboard/reservations`**
```ts
// Réservations actives
prisma.reservations.findMany({
  where: { status: 'active' },
  include: { node: true }
})
```

---

## Composants

### `CpuRamChart`
- Recharts `LineChart` responsive
- 2 lignes : CPU% (bleu `blue-400`) et RAM% (violet `purple-400`)
- Axe X : timestamps formatés `HH:mm`
- Axe Y : 0–100%
- Tooltip avec valeurs exactes
- Props : `data: { timestamp: string, cpu: number, ram: number }[]`, `nodeName: string`

### `ForecastChart`
- Recharts `AreaChart` avec gradient
- Zone verte < 70% CPU prédit, orange 70–90%, rouge > 90%
- Points historiques (trait plein) + prédiction (trait pointillé)
- Props : `forecast: ForecastStep[]`, `riskLevel: 'low'|'medium'|'high'`

### `NodeCard`
- Affiche : nom du nœud, CPU% actuel, RAM% actuel, disk%, dernière collecte
- Couleur de bordure selon charge : vert/orange/rouge
- Lien vers prédictions du nœud

### Formulaire réservation manuelle (PRV-49)
- Champs : nœud (select), deployment, namespace, CPU (cores), RAM (GB), durée (minutes)
- Appel `POST /api/reserve` avec JWT depuis cookie httpOnly
- Feedback inline : succès / erreur Kubernetes

---

## Auth

Le middleware JWT est déjà en place (`/middleware.ts`). La page `/login` :
- Formulaire email/password (les credentials admin sont dans le Secret K8s PRV-35)
- Appel `POST /api/auth/token` → JWT stocké en cookie httpOnly `session`
- Redirect vers `/dashboard` après login
- Le layout dashboard vérifie le cookie, redirige vers `/login` si absent

---

## Style

- **Dark theme** : fond `gray-900`, cartes `gray-800`, texte `gray-100`
- **Accents** : `blue-500` (actions principales), `green-400` / `yellow-400` / `red-400` (états)
- **Pas de lib UI** (pas de shadcn, radix, etc.) — Tailwind pur pour que Romain puisse tout modifier
- **Police** : Geist (déjà installée dans le projet)

---

## Gestion des erreurs

- Chaque section de page a son propre `error.tsx` (error boundary Next.js) → une section cassée n'abat pas le dashboard
- États de chargement avec `SkeletonCard` (Tailwind animate-pulse)
- Si un nœud n'a pas de métriques récentes (> 2min) → badge "Hors ligne" sur la NodeCard

---

## Ordre d'implémentation

1. **PRV-50** — Installer Recharts, créer `CpuRamChart` et `ForecastChart`
2. **PRV-46** — Layout sidebar + page charge actuelle avec `NodeCard` + `CpuRamChart`
3. **PRV-47** — Page prédictions avec `ForecastChart`
4. **PRV-48** — Page réservations actives avec `ReservationCard`
5. **PRV-49** — Formulaire réservation manuelle

Chaque ticket = 1 commit avec référence Jira dans le message.
