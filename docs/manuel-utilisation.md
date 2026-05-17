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

#### L'alternative classique : LSTM / RNN

Pour prédire des séries temporelles de métriques, l'approche classique serait un
réseau de neurones récurrents de type LSTM (Long Short-Term Memory). Ce type de
modèle est conçu précisément pour capturer les dépendances temporelles dans des
données séquentielles (charge CPU qui monte chaque matin à 9h, par exemple).

#### Pourquoi nous avons choisi un LLM

| Critère                   | LSTM/RNN                              | LLM (qwen2:0.5b)                        |
|---------------------------|---------------------------------------|------------------------------------------|
| **Données d'entraînement**| Des semaines/mois de métriques labellisées nécessaires | Aucune — le prompt suffit |
| **Mise en service**       | Pipeline : collecte → entraînement → évaluation → déploiement | Immédiat, modèle pré-entraîné |
| **Flexibilité**           | Changer le comportement = réentraîner | Changer le comportement = modifier le prompt |
| **Explication**           | Boîte noire numérique                 | Peut générer une explication en langage naturel |
| **Précision sur patterns cycliques** | Excellente (après entraînement) | Correcte, pas optimale |
| **Latence**               | < 10 ms par inférence                 | 1-3 s par step (6-18 s pour 30 min) |
| **Ressources**            | Léger à l'inférence                   | ~350 MB de modèle, 2 GB RAM minimum |

#### Justification du choix dans notre contexte

Dans le contexte de ce projet académique, le LLM présente trois avantages décisifs :

1. **Aucun bootstrap de données** : un LSTM nécessite d'accumuler suffisamment de
   métriques historiques avant de pouvoir être entraîné. Avec un LLM, la prédiction
   fonctionne dès le premier jour.

2. **Raisonnement explicable** : le modèle identifie la tendance en une phrase avant
   de prédire (ex: "CPU steadily increasing, likely to continue rising"). Cette
   transparence est précieuse pour un outil d'aide à la décision opérationnelle.

3. **Déploiement simplifié** : Ollama + qwen2:0.5b se déploie en un seul pod K8s,
   sans infrastructure MLOps dédiée (MLflow, feature store, serving GPU, etc.).

#### Limite principale

La précision sur des patterns très réguliers (charge de pointe quotidienne identique)
serait meilleure avec un LSTM entraîné. Le LLM raisonne sur la tendance récente mais
ne "mémorise" pas les cycles long-terme de l'infrastructure.

### 2.4 Scénario de charge de pointe

Ce scénario illustre l'utilité concrète du module de prédiction lors d'une montée
en charge prévisible (arrivée des utilisateurs le matin).

#### Contexte

k8s-worker-1 héberge l'application Next.js, le prediction-service et Ollama. À 8h50,
un opérateur consulte le dashboard et observe la tendance suivante :

| Heure  | CPU (%) | RAM (%) |
|--------|---------|---------|
| 08:20  | 22      | 44      |
| 08:25  | 28      | 45      |
| 08:30  | 35      | 47      |
| 08:35  | 48      | 50      |
| 08:40  | 61      | 53      |
| 08:45  | 70      | 56      |

La courbe CPU monte régulièrement (+8 à +13 points toutes les 5 minutes).

#### Forecast lancé à 8h50 (horizon 30 min, step 5 min)

L'opérateur lance un forecast sur k8s-worker-1. Le LLM identifie la tendance :
> "CPU steadily increasing due to morning load spike, likely to continue rising."

Prédiction générée :

| Heure prévue | CPU prédit (%) | RAM prédite (%) | Risque     |
|--------------|----------------|-----------------|------------|
| 08:55        | 77             | 59              | **medium** |
| 09:00        | 82             | 61              | **medium** |
| 09:05        | 86             | 63              | **medium → high** |
| 09:10        | 89             | 65              | **high**   |
| 09:15        | 92             | 67              | **high**   |
| 09:20        | 94             | 69              | **high** — "Intervention requise immédiatement" |

#### Actions recommandées affichées dans le dashboard

- Badge rouge sur la carte de k8s-worker-1
- Recommandation : "Intervention requise immédiatement"
- Options disponibles via l'interface :
  1. **Libérer des réservations** : aller dans Réservations et libérer les quotas
     non critiques sur k8s-worker-1
  2. **Réduire la charge** : migrer manuellement des déploiements secondaires vers
     k8s-worker-2 via `kubectl scale` ou en modifiant le `nodeSelector`

#### Ce que ce scénario démontre

Le module de prédiction donne à l'opérateur une fenêtre d'action de 15 à 20 minutes
avant la saturation, permettant une intervention proactive plutôt que réactive.

## 3. Prérequis et installation
### 3.1 Infrastructure matérielle

Le projet requiert trois machines Linux (physiques ou VMs) avec Ubuntu 22.04 LTS.

| Machine      | IP               | CPU    | RAM   | Disque | Rôle K8s      |
|--------------|------------------|--------|-------|--------|---------------|
| k8s-master   | 192.168.10.213   | 2 vCPU | 4 GB  | 30 GB  | Control plane |
| k8s-worker-1 | 192.168.10.243   | 4 vCPU | 8 GB  | 50 GB  | Worker principal (Ollama, app, DB) |
| k8s-worker-2 | 192.168.10.126   | 2 vCPU | 4 GB  | 30 GB  | Worker secondaire |

> **Note :** k8s-worker-1 nécessite 8 GB de RAM minimum pour faire tourner simultanément
> Ollama (2-4 GB), PostgreSQL (512 MB), le prediction-service (256 MB) et Next.js (512 MB).

### 3.2 Logiciels requis

À installer sur **chaque machine** :

```bash
# Docker Engine
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# kubeadm, kubelet, kubectl (version 1.28)
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.28/deb/Release.key | sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.28/deb/ /' | sudo tee /etc/apt/sources.list.d/kubernetes.list
sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo systemctl enable kubelet
```

À installer sur **k8s-master uniquement** :

```bash
# Helm 3
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# git
sudo apt-get install -y git
```

### 3.3 Configuration réseau

Sur **chaque machine**, ajouter dans `/etc/hosts` :

```
192.168.10.213  k8s-master
192.168.10.243  k8s-worker-1
192.168.10.126  k8s-worker-2
192.168.10.213  metrics.local
```

Désactiver le swap (requis par Kubernetes) :

```bash
sudo swapoff -a
sudo sed -i '/ swap / s/^/#/' /etc/fstab
```

Initialiser le cluster (sur k8s-master) :

```bash
sudo kubeadm init --pod-network-cidr=10.244.0.0/16
mkdir -p $HOME/.kube
sudo cp /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Installer Flannel (réseau pods)
kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml
```

Joindre les workers (commande affichée par kubeadm init, à exécuter sur chaque worker) :

```bash
sudo kubeadm join 192.168.10.213:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>
```

Installer nginx Ingress Controller :

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.8.2/deploy/static/provider/baremetal/deploy.yaml
```

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
