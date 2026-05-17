# Manuel d'utilisation — metrics-app
## Plateforme de monitoring Kubernetes avec prédiction LLM

---

## 1. Introduction

**Projet :** metrics-app
**Auteurs :** [Prénom Nom 1], [Prénom Nom 2]
**Cours :** [Nom du cours]
**Date :** Mai 2026

---

### Présentation du projet

metrics-app est une plateforme de monitoring d'un cluster Kubernetes à trois nœuds.
Elle collecte en continu les métriques CPU et RAM de chaque nœud via Prometheus,
les persiste dans une base PostgreSQL, et les expose dans un dashboard web temps réel.

L'application intègre deux fonctionnalités avancées :

- **Réservation de ressources** : un opérateur peut allouer des quotas CPU/RAM sur un
  namespace Kubernetes directement depuis l'interface, avec libération automatique à
  expiration.
- **Prédiction LLM** : un module IA utilise un modèle de langage léger (qwen2:0.5b via
  Ollama) pour prédire l'évolution de la charge CPU et RAM sur les 30 prochaines minutes,
  et évaluer le risque de surcharge (low / medium / high).

## 2. Architecture et choix techniques
### 2.1 Vue d'ensemble de l'architecture

Le système est composé de six composants déployés sur un cluster Kubernetes
à trois nœuds (k8s-master, k8s-worker-1, k8s-worker-2) :

```
Navigateur
    │
    ▼
[Next.js App — app-production — k8s-worker-1:3000]
    │                  │
    │                  ▼
    │        [prediction-service — ai-module — k8s-worker-1:3001]
    │                  │
    │                  ▼
    │         [Ollama qwen2:0.5b — ai-module — k8s-worker-1:11434]
    │
    ▼
[PostgreSQL — default — k8s-worker-1:5432]
    ▲
    │
[CronJobs scraper/aggregator] ← [Prometheus — monitoring:9090]
                                       ▲
                               node_exporter (chaque nœud)
```

| Composant          | Namespace       | Nœud K8s     | Port  | Rôle                                        |
|--------------------|-----------------|--------------|-------|---------------------------------------------|
| Next.js App        | app-production  | k8s-worker-1 | 3000  | Interface web, API REST, orchestration      |
| prediction-service | ai-module       | k8s-worker-1 | 3001  | Prédiction CPU/RAM via prompts LLM          |
| Ollama             | ai-module       | k8s-worker-1 | 11434 | Moteur d'inférence LLM (qwen2:0.5b)         |
| PostgreSQL         | default         | k8s-worker-1 | 5432  | Stockage métriques, réservations, forecasts |
| Prometheus         | monitoring      | —            | 9090  | Collecte métriques node_exporter            |
| Grafana            | monitoring      | —            | 3000  | Visualisation Prometheus (optionnel)        |

**Flux de données principal :**
1. node_exporter expose les métriques brutes de chaque nœud sur le port 9100
2. Prometheus scrape node_exporter toutes les 30 secondes
3. Le CronJob scraper interroge Prometheus et insère les données dans PostgreSQL
4. Next.js lit PostgreSQL pour afficher les métriques en temps réel
5. Pour la prédiction, Next.js délègue au prediction-service qui interroge directement
   Prometheus et Ollama

### 2.2 Le système de prédiction — fonctionnement détaillé

#### Pipeline d'une prédiction forecast

Quand l'utilisateur lance une prédiction pour un nœud donné, voici ce qui se passe :

1. **Requête client → Next.js**
   Le navigateur envoie `POST /api/forecast` avec :
   ```json
   { "node": "k8s-worker-1", "horizon_minutes": 30, "step_minutes": 5 }
   ```

2. **Next.js → prediction-service**
   Next.js valide la requête, vérifie que le nœud existe en base, puis appelle
   `POST http://prediction-service.ai-module.svc.cluster.local:3001/forecast`
   avec les mêmes paramètres.

3. **prediction-service → Prometheus**
   Le service interroge Prometheus pour récupérer l'historique réel CPU et RAM
   sur les 30 dernières minutes avec un pas de 5 minutes (6 points).
   Requêtes PromQL utilisées :
   ```
   CPU : round(100 - (avg(rate(node_cpu_seconds_total{mode="idle",instance="192.168.10.243:9100"}[5m])) * 100), 0.1)
   RAM : round((1 - node_memory_MemAvailable_bytes{instance="192.168.10.243:9100"} / node_memory_MemTotal_bytes{instance="192.168.10.243:9100"}) * 100, 0.1)
   ```

4. **Prédiction auto-régressive (6 steps pour un horizon de 30min/5min)**
   Le service génère les prédictions step par step. À chaque itération :
   - Il construit un prompt incluant l'historique connu
   - Il envoie ce prompt à Ollama (qwen2:0.5b)
   - Il extrait les valeurs CPU/RAM prédites de la réponse JSON du LLM
   - Ces nouvelles valeurs deviennent l'entrée du step suivant (auto-régression)

5. **Calcul du risque**
   Une fois les 6 steps générés, le service calcule :
   - `cpu_peak` / `ram_peak` : valeurs maximales prédites
   - Risque : `high` si cpu_peak > 90% ou ram_peak > 95%, `medium` si cpu_peak > 75%
     ou ram_peak > 85%, `low` sinon.

6. **Retour et sauvegarde**
   Le résultat est retourné à Next.js, sauvegardé en base, puis envoyé au client
   pour affichage sur le graphique ForecastChart.

#### Aperçu des prompts (voir Annexe 6.1 pour les versions complètes)

- **Prompt /predict** : donne l'historique CPU et RAM, demande les valeurs suivantes
  en JSON `{"cpu_percent": X, "ram_percent": Y}`
- **Prompt /forecast step** : donne l'historique détaillé avec timestamps relatifs,
  demande d'identifier la tendance puis prédire le prochain step en JSON

### 2.3 Pourquoi un LLM plutôt qu'un réseau de neurones classique ?
### 2.4 Scénario de charge de pointe

## 3. Prérequis et installation
### 3.1 Infrastructure matérielle
### 3.2 Logiciels requis
### 3.3 Configuration réseau

## 4. Déploiement complet
### 4.1 Récupération du code source
### 4.2 Namespaces Kubernetes
### 4.3 Base de données PostgreSQL
### 4.4 Prometheus et Grafana
### 4.5 Application Next.js
### 4.6 Ollama (moteur LLM)
### 4.7 Prediction-service
### 4.8 CronJobs
### 4.9 Vérification finale

## 5. Guide utilisateur
### 5.1 Connexion
### 5.2 Dashboard principal
### 5.3 Panel de prédiction
### 5.4 Réservation manuelle de ressources
### 5.5 Événements et alertes Kubernetes

## 6. Annexes
### 6.1 Prompts IA utilisés
### 6.2 Variables d'environnement
### 6.3 Commandes de diagnostic
