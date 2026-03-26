# Etat du projet — Sprint PRV3
> Dernière mise à jour : 26 mars 2026

---

## Architecture globale

```
[Next.js App - k8s-master]
  POST /api/predict   → prediction-service:3001/predict
  POST /api/forecast  → prediction-service:3001/forecast

[prediction-service - k8s-worker-1 (image: prediction-service:1.2.0)]
  → Ollama (qwen2:0.5b) via http://ollama-service:11434
  → Prometheus via monitoring namespace
```

---

## Ce qui est FAIT (côté Next.js)

### PRV-23 — Endpoint POST /api/forecast
- **Fichier :** `app/api/forecast/route.ts`
- Valide la requête avec `ForecastRequestSchema`
- Vérifie que le node existe en DB
- Récupère l'historique CPU/RAM depuis `metrics_raw` (PostgreSQL)
- Appelle `callForecastService()` → `prediction-service/forecast`
- Évalue le risque (`assessRisk`) et sauvegarde en DB
- Retourne un JSON enrichi avec `forecast[]`, `summary`, `risk_assessment`

### PRV-24 — Évaluation du risque configurable
- **Fichier :** `lib/services/risk-assessment.ts`
- Calcule `low / medium / high` + score + recommendation à partir de `cpu_peak` et `ram_peak`
- Utilisé dans `/api/forecast`

### PRV-26 — Alignement payload prediction-service
- **Fichier :** `lib/config/ollama.ts`
- `buildForecastPayload()` construit le payload plat attendu par le prediction-service
- `SEND_PROMPT_TEMPLATE` conditionnel (variable d'env)
- Résolution du conflit de merge sur `prediction-client.ts`

### PRV-27 — Validation Zod des réponses
- **Fichier :** `lib/validators/predict-response.ts`
  - `PredictionServiceResponseSchema` : contrat /predict
  - Champs : `node`, `predicted_cpu_percent`, `predicted_ram_percent`, `overload_risk (low|medium|high)`, `recommendation`, `model_used`, `timestamp`
- **Fichier :** `lib/validators/forecast-response.ts`
  - `ForecastServiceResponseSchema` : contrat /forecast
  - Champs : `node`, `forecast[]` (t, cpu_percent, ram_percent), `cpu_avg`, `cpu_peak`, `ram_avg`, `ram_peak`, `model_used`, `timestamp`
- Résolution du merge conflict sur `/predict` et alignement schema Zod (commit c552127)

---

## Ce qui est FAIT (côté prediction-service — index.js sur k8s-worker-1)

Le service tourne sur k8s-worker-1 avec l'image `prediction-service:1.2.0`.

### Endpoints implémentés dans index.js
| Route | Méthode | Description |
|-------|---------|-------------|
| `/health` | GET | Status, urls, modèle |
| `/predict` | POST | Prédiction simple CPU/RAM à partir d'historique |
| `/forecast` | POST | Prédiction multi-pas, requête Prometheus directe |

### Prompt /predict (buildPredictPrompt — ligne 47-52)
Envoie à Ollama l'historique `cpu_history[]` et `ram_history[]` et attend :
```json
{"node":"<nom>","predicted_cpu_percent":0,"predicted_ram_percent":0,"overload_risk":"low|medium|high","recommendation":"<phrase>"}
```

### Prompt /forecast (buildForecastPrompt — ligne 53-58)
Requête Prometheus directe pour obtenir l'historique réel, puis envoie à Ollama et attend :
```json
{"forecast":[{"t":"+5min","cpu_percent":0,"ram_percent":0}],"cpu_avg":0,"cpu_peak":0,"ram_avg":0,"ram_peak":0}
```

---

## Problème actuel — /predict (séance du 26 mars)

### Symptôme
Le prediction-service retourne parfois `overload_risk: "unknown"` car le LLM (qwen2:0.5b) ne génère pas toujours un JSON valide avec le bon champ. Or le schema Zod du Next.js attend strictement `z.enum(['low', 'medium', 'high'])` → validation échoue → 502.

### Tentative de fix en cours (non finalisée)
Sur k8s-worker-1 (`/root/index.js`), tentative de simplifier le prompt `/predict` pour que le LLM ne retourne que `{"cpu_percent":0,"ram_percent":0}` et que le service calcule lui-même le risque/recommendation.

**Pourquoi ça bloque :** modification de `index.js` via Python directement sur le nœud, sans reconstruire l'image Docker. Le fichier `/root/index.js` a été copié depuis l'overlay Docker mais la chaîne de build (Dockerfile dans `/root/`) n'est pas encore finalisée.

### Ce qu'il reste à faire pour clore ce bug
1. Finaliser le `index.js` modifié sur k8s-worker-1 (prompt simplifié + calcul risque côté service)
2. Construire la nouvelle image : `docker build -t prediction-service:1.2.1 /root/`
3. Mettre à jour le tag dans `k8s/prediction-service.yaml` (1.2.0 → 1.2.1)
4. Redéployer : `kubectl rollout restart deployment/prediction-service -n ai-module`
5. Vérifier que le schema Zod `PredictionServiceResponseSchema` reste compatible avec la nouvelle réponse

---

## Contrat d'API Next.js ↔ prediction-service

### POST /predict — payload envoyé
```json
{
  "metrics": {
    "node": "k8s-worker-1",
    "cpu_history": [12.3, 14.5, 13.1],
    "ram_history": [55.0, 56.2, 54.8]
  }
}
```

### POST /predict — réponse attendue (Zod)
```json
{
  "node": "k8s-worker-1",
  "predicted_cpu_percent": 15.0,
  "predicted_ram_percent": 57.0,
  "overload_risk": "low",
  "recommendation": "Nominal",
  "model_used": "qwen2:0.5b",
  "timestamp": "2026-03-26T13:00:00.000Z"
}
```

### POST /forecast — payload envoyé
```json
{
  "node": "k8s-worker-1",
  "horizon_minutes": 30,
  "step_minutes": 5
}
```

### POST /forecast — réponse attendue (Zod)
```json
{
  "node": "k8s-worker-1",
  "forecast": [{"t": "+5min", "cpu_percent": 14.2, "ram_percent": 56.1}],
  "cpu_avg": 13.5,
  "cpu_peak": 18.0,
  "ram_avg": 55.0,
  "ram_peak": 60.0,
  "model_used": "qwen2:0.5b",
  "timestamp": "2026-03-26T13:00:00.000Z"
}
```

---

## Infrastructure K8s

| Composant | Namespace | Node | Image |
|-----------|-----------|------|-------|
| prediction-service | ai-module | k8s-worker-1 | prediction-service:1.2.0 |
| ollama | ai-module | k8s-worker-1 | (ollama-service:11434) |
| Next.js app | default | k8s-master | - |
| Prometheus | monitoring | - | port 9090 |
| PostgreSQL | default | - | StatefulSet |

**Note :** kubectl ne fonctionne pas depuis k8s-worker-2 (pas de kubeconfig), uniquement depuis k8s-master ou k8s-worker-1 avec le bon KUBECONFIG.

---

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `app/api/predict/route.ts` | Endpoint POST /api/predict |
| `app/api/forecast/route.ts` | Endpoint POST /api/forecast |
| `lib/services/prediction-client.ts` | Client HTTP vers prediction-service |
| `lib/validators/predict.ts` | Schema Zod requête /predict |
| `lib/validators/predict-response.ts` | Schema Zod réponse prediction-service /predict |
| `lib/validators/forecast-response.ts` | Schema Zod réponse prediction-service /forecast |
| `lib/services/risk-assessment.ts` | Calcul risque surcharge |
| `lib/config/ollama.ts` | Config prompts et options Ollama |
| `k8s/prediction-service.yaml` | Déploiement K8s prediction-service |
| `k8s/ollama-stack.yaml` | Déploiement Ollama |
