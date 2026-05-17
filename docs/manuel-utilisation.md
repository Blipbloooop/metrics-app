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
