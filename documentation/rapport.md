# Rapport de Projet R&D — Application Web Anticipant la Réservation de Ressources Serveur

**Équipe :** Romain Barthélémy, Jean-Baptiste Raffi  
**Filière :** ETN A5  
**Encadrant :** Ghassan Oreiby  
**Établissement :** Polytech  
**Année :** 2025–2026

---

## Table des matières

1. [Cahier des charges et présentation de la problématique](#1-cahier-des-charges-et-présentation-de-la-problématique)
2. [Étude bibliographique](#2-étude-bibliographique)
3. [Travaux réalisés](#3-travaux-réalisés)
4. [Gestion de projet](#4-gestion-de-projet)
5. [Tests de validation](#5-tests-de-validation)
6. [Conclusion et perspectives](#6-conclusion-et-perspectives)

---

## 1. Cahier des charges et présentation de la problématique

### 1.1 Contexte

Les infrastructures cloud et les environnements virtuels modernes hébergent des milliers de services simultanés. La demande en ressources — CPU, mémoire, entrées/sorties réseau — est par nature variable : pics de charge, périodes creuses, comportements saisonniers. Dans ce contexte, l'allocation statique ou manuelle des ressources engendre deux problèmes antagonistes :

- **Sous-allocation** : les temps de réponse se dégradent, les SLA ne sont pas respectés, les utilisateurs subissent des interruptions de service.
- **Sur-allocation** : les ressources sont réservées mais inutilisées, entraînant un coût financier direct et un gaspillage énergétique.

### 1.2 Objectifs du projet

L'objectif est de concevoir et déployer une plateforme web capable de :

1. **Collecter** en continu l'utilisation des ressources de chaque nœud serveur (CPU, RAM, disque, réseau).
2. **Prédire** la charge future à horizon configurable à l'aide d'un modèle d'intelligence artificielle.
3. **Réserver automatiquement** les ressources Kubernetes en amont des pics de charge prévus, et les **libérer proactivement** dès que la charge redescend.
4. **Exposer un tableau de bord** permettant à l'administrateur de visualiser l'état du cluster, les prévisions et d'intervenir manuellement si besoin.

### 1.3 Périmètre et contraintes

Le projet est déployé sur un cluster Kubernetes à trois nœuds hébergé sur hyperviseur ESXi 8.0 :

| Nœud | IP | Rôle | CPU | RAM |
|---|---|---|---|---|
| k8s-master | 192.168.10.213 | Control plane | 2 cœurs | 4 Go |
| k8s-worker-1 | 192.168.10.243 | Workloads IA | 4 cœurs | 8 Go |
| k8s-worker-2 | 192.168.10.126 | Workloads applicatifs | 4 cœurs | 8 Go |

Les contraintes matérielles sont significatives : les modèles de machine learning classiques nécessitant un GPU ou une grande mémoire sont exclus. Le cluster ne dispose pas de StorageClass dynamique, et le nœud maître dispose de seulement 2 cœurs et 4 Go de RAM, ce qui limite les workloads possibles.

---

## 2. Étude bibliographique

### 2.1 Gestion des ressources dans Kubernetes

Kubernetes propose nativement des mécanismes de gestion des ressources : les `ResourceQuota` plafonnent la consommation par namespace, les `LimitRange` encadrent les requêtes et limites par conteneur, et le `HorizontalPodAutoscaler` ajuste le nombre de réplicas en fonction de métriques CPU ou personnalisées. Toutefois, ces mécanismes sont **réactifs** : ils agissent après que la surcharge est observée. Notre approche vise à passer d'une logique réactive à une logique **prédictive** en anticipant les besoins avant qu'ils se matérialisent.

### 2.2 Approches de prédiction de charge

Plusieurs familles d'algorithmes peuvent modéliser l'évolution de métriques temporelles :

- **Modèles statistiques classiques (ARIMA, SARIMA)** : performants sur des séries régulières et saisonnières, mais nécessitent un calibrage par série et échouent sur des patterns complexes ou non stationnaires.
- **Réseaux de neurones récurrents (LSTM, GRU)** : capturent des dépendances temporelles longues, mais requièrent un entraînement sur un historique conséquent (plusieurs semaines minimum) et une infrastructure GPU.
- **Modèles de langage (LLM)** : les modèles de type Transformer pré-entraînés peuvent, avec un prompt structuré, analyser un historique en contexte et produire une prédiction sans phase d'entraînement dédiée. Leur capacité de raisonnement en langage naturel permet également de générer une recommandation textuelle compréhensible par un opérateur.

### 2.3 Justification du choix : LLM embarqué (Ollama + qwen2:0.5b)

Dans notre contexte contraint (pas de GPU, RAM limitée), les LSTM sont inapplicables en production. Les modèles statistiques, bien qu'applicables, ne produisent pas de recommandation actionnable. Nous avons retenu l'approche LLM via **Ollama**, un moteur d'inférence local, avec le modèle **qwen2:0.5b** (quantifié en 4 bits, ~2 Go), pour les raisons suivantes :

- **Légèreté** : le modèle s'exécute sur CPU avec une empreinte mémoire compatible avec k8s-worker-1.
- **Absence de phase d'entraînement** : le modèle est généraliste et peut raisonner sur une séquence de métriques fournie en contexte (few-shot prompting).
- **Double sortie** : il retourne à la fois une valeur numérique (CPU/RAM prédits) et une recommandation textuelle interprétable par l'opérateur.

La limite principale est la précision : un modèle de 0,5 milliard de paramètres peut produire des réponses incohérentes sur des patterns inhabituels. Une stratégie de parsing robuste avec fallback sur la dernière valeur observée est implémentée côté `prediction-service` pour y pallier.

### 2.4 Collecte de métriques : Prometheus + node-exporter

Prometheus est la solution standard de la CNCF pour la collecte et le stockage de métriques d'infrastructure. Associé à `node-exporter` (DaemonSet sur chaque nœud), il expose des métriques système granulaires (CPU par mode, mémoire disponible, I/O disque, trafic réseau) accessibles via une API HTTP et un langage de requêtes dédié (PromQL). Cette solution est native à l'écosystème Kubernetes, ce qui simplifie l'intégration.

---

## 3. Travaux réalisés

### 3.1 Architecture générale

La plateforme s'articule en **quatre couches logiques** :

```
┌─────────────────────────────────────────────────────────────────────┐
│ Couche 1 — Collecte                                                  │
│   node-exporter (DaemonSet) → Prometheus → CronJob scraper → DB     │
├─────────────────────────────────────────────────────────────────────┤
│ Couche 2 — Prédiction IA                                             │
│   API Next.js → prediction-service (Express) → Ollama (qwen2:0.5b)  │
├─────────────────────────────────────────────────────────────────────┤
│ Couche 3 — Orchestration                                             │
│   API Next.js : ingest, predict, forecast, reserve, release          │
│   PostgreSQL (Prisma) — persistance état et historique               │
├─────────────────────────────────────────────────────────────────────┤
│ Couche 4 — Action K8s                                                │
│   @kubernetes/client-node : ResourceQuota, LimitRange, Scale         │
└─────────────────────────────────────────────────────────────────────┘
```

Le frontend (Next.js/React) consomme les mêmes API et expose un tableau de bord temps réel.

### 3.2 Infrastructure Kubernetes

Le cluster a été monté manuellement sur trois VMs ESXi avec **Kubernetes v1.29.15** et **cri-dockerd** comme runtime de conteneurs. Les points techniques notables :

- **CNI Flannel 0.25.0** pour le réseau overlay inter-nœuds.
- **NGINX Ingress Controller 1.10.0** pour le routage HTTP/HTTPS.
- **Aucune StorageClass dynamique** : tous les PersistentVolumes sont créés statiquement avec `hostPath` et binding explicite via `volumeName`. PostgreSQL est stocké sur un PV de 10 Go sur k8s-worker-1.
- Les composants de monitoring (Prometheus, Grafana, AlertManager, node-exporter) sont déployés dans le namespace `monitoring` via le chart Helm `kube-prometheus-stack`.

### 3.3 Pipeline de collecte des métriques

**CronJob K8s `scraper` (toutes les minutes) :**

Le scraper interroge Prometheus via l'API `query` et récupère pour chaque nœud les valeurs instantanées de CPU (% calculé depuis `node_cpu_seconds_total{mode="idle"}`), de RAM (`node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes`), d'usage disque et du trafic réseau. Les valeurs absolues sont converties en pourcentages par rapport aux capacités connues du nœud, puis envoyées en POST à l'endpoint `/api/metrics/ingest` de l'application Next.js, authentifié par un Bearer token stocké en secret Kubernetes.

**Endpoint `POST /api/metrics/ingest` :**

Valide la payload avec un schéma Zod, vérifie que le `node_id` existe en base, puis persiste un enregistrement dans la table `metrics_raw`. La rétention de cette table est de 30 jours.

**CronJob K8s `aggregator` (toutes les 5 minutes) :**

Pour chaque nœud et chaque fenêtre temporelle (5 min, 15 min, 1 h), l'agrégateur calcule en PostgreSQL les statistiques descriptives (avg, min, max, percentile 95) via `percentile_cont` — une fonction d'agrégation ordonnée non disponible dans l'ORM Prisma, d'où l'usage de `$queryRaw`. Le résultat est inséré dans `metrics_aggregated` avec une contrainte `UNIQUE(node_id, window, window_start)` garantissant l'idempotence (les fenêtres passées sont recalculées en cas de rattrapage). La rétention est d'un an.

### 3.4 Module de prédiction IA

**prediction-service (Node.js/Express, port 3001, namespace `ai-module`) :**

Service développé par Jean-Baptiste Raffi. Il expose deux endpoints :
- `POST /predict` : prend un historique court de CPU/RAM, forge un prompt JSON structuré, appelle Ollama et extrait la valeur numérique par parsing regex avec fallback.
- `POST /forecast` : génère un forecast multi-pas en alimentant iterativement le LLM sur un horizon configurable (ex. 30 min par pas de 5 min). Les données réelles sont préalablement récupérées depuis Prometheus.

**Endpoint `POST /api/predict` (Next.js) :**

Enrichit la requête avec le contexte DB (5 dernières métriques brutes, réservations actives, alertes récentes, historique des prédictions) avant d'appeler le prediction-service. La réponse est sauvegardée dans la table `predictions` et retournée au client avec le contexte complet.

**Endpoint `POST /api/forecast` (Next.js) :**

Récupère l'historique depuis `metrics_raw`, appelle `/forecast` du prediction-service, évalue le risque de surcharge (seuils configurables par variable d'environnement), crée une alerte en base si les seuils sont franchis, et expose les `raw_steps` (prompt LLM brut par pas de temps) pour inspection dans l'interface via le `LLMDrawer`.

### 3.5 Gestion des réservations

**Réservation manuelle — `POST /api/reserve` :**

L'opérateur spécifie le nœud cible, le namespace, le Deployment, le nombre de réplicas et les ressources par réplica. L'endpoint vérifie la capacité disponible via l'API Kubernetes (`node.status.allocatable`). Si la capacité est suffisante, il crée séquentiellement un `ResourceQuota`, un `LimitRange` et scale le Deployment, puis persiste l'état en base. En cas d'insuffisance, la réservation passe en statut `queued` pour être traitée lors du prochain cycle de libération.

**Réservation automatique — `POST /api/auto-reserve` :**

Déclenché par un CronJob K8s. Pour chaque nœud worker, il calcule la moyenne CPU et RAM sur les 5 dernières minutes. Si un nœud dépasse 80 % de CPU ou 85 % de RAM et n'est pas en période de cooldown (10 min), il est sélectionné. Un score composite `cpu_avg × 0.5 + ram_avg × 0.3 + active_reservations × 0.2` détermine le nœud prioritaire. Les ressources à réserver sont calculées avec une marge de sécurité de 15 % au-dessus de l'excès observé. Une alerte `critical` est créée si le CPU dépasse 90 %.

**Libération automatique — `POST /api/auto-release` :**

Trois déclencheurs sont évalués séquentiellement à chaque cycle (pour éviter les doubles-libérations) :

1. **Expiration** : toute réservation dont `expires_at` est dépassé est libérée.
2. **Chute de charge** : les réservations automatiques sur un nœud dont CPU et RAM moyens passent sous 30 % pendant 5 min sont libérées.
3. **Fin de Job K8s** : un Job récemment terminé (Completed ou Failed) dans un namespace surveillé déclenche la libération des réservations antérieures dans ce namespace.

Après chaque cycle de libération, le module de réallocation tente d'activer les réservations en attente (`queued`), en priorité les réservations manuelles.

### 3.6 Sécurité

- **Authentification** : JWT HS256 signé côté serveur, stocké en cookie `httpOnly` (pas d'accès JavaScript). Durée de session : 24 h. Comparaison des credentials via `timingSafeEqual` pour résister aux attaques timing.
- **Middleware Next.js** : le dashboard (`/dashboard/*`) requiert un cookie de session valide. Les API sensibles (`/api/reserve`, `/api/release`, `/api/predict`, `/api/forecast`) acceptent le cookie **ou** un Bearer JWT.
- **Rate limiting** : 60 requêtes par fenêtre glissante par IP sur toutes les routes `/api/*`, retournant HTTP 429 avec les headers `X-RateLimit-*`.
- **Validation Zod** : chaque endpoint valide la payload entrante avec un schéma explicite avant tout traitement.
- **Secrets K8s** : les tokens et credentials sont injectés via des Secrets Kubernetes, jamais commités en clair.

### 3.7 Interface utilisateur

Le frontend est une Single Page Application React servie par Next.js avec Server-Side Rendering initial :

- **Dashboard principal** : carte par nœud affichant CPU, RAM, disque en temps réel avec auto-rafraîchissement, graphique historique Recharts (CPU/RAM sur 30 min), alertes actives.
- **Page Prédictions** : formulaire de forecast avec sélection du nœud et de l'horizon, graphique de prévision multi-pas, `LLMDrawer` permettant d'inspecter le raisonnement brut du modèle (prompts et réponses pas à pas).
- **Page Réservations** : tableau des réservations actives avec indicateur TTL, formulaire de réservation manuelle, historique des libérations.
- **Page Namespaces** : liste des namespaces Kubernetes avec leur état.

### 3.8 Difficultés rencontrées

| Difficulté | Solution adoptée |
|---|---|
| Pas de StorageClass dynamique dans le cluster | PV statiques `hostPath` avec `volumeName` explicite dans chaque PVC |
| Le swap se réactive après coupure électrique sur les VMs, rendant le cluster instable | Script de désactivation au démarrage + procédure documentée |
| `percentile_cont` non supporté par l'ORM Prisma | SQL brut paramétré via `$queryRaw` pour l'agrégateur |
| `window` est un mot réservé PostgreSQL | Guillemets doubles systématiques autour du champ `"window"` dans toutes les requêtes SQL brutes |
| Le LLM retourne parfois du texte autour du JSON attendu | Parser regex `/{[\s\S]*?}/` avec fallback sur la dernière valeur observée |
| Timing attack sur l'endpoint de login | `crypto.timingSafeEqual` pour comparer les credentials |
| Prisma 7 : `prisma.config.ts` à la racine et non dans `/prisma/` | Configuration adaptée selon la documentation Prisma 7 |

---

## 4. Gestion de projet

### 4.1 Outil et méthode

Le projet a été piloté via **JIRA**, organisé en epics et tickets. Cette approche a permis de suivre l'avancement des travaux, d'identifier les blocages et de prioriser les développements au fil des itérations.

Trois types de tickets ont été utilisés :

| Type | Description |
|---|---|
| **Tâche** | Travail planifié à l'avance — implémentation d'une fonctionnalité, configuration d'un composant, rédaction de documentation. |
| **Anomalie** | Dysfonctionnement constaté en cours de développement ou lors des tests, nécessitant une correction corrective. |
| **Évolution** | Modification ou amélioration d'une fonctionnalité existante, identifiée en cours de développement suite à un retour ou une contrainte nouvelle. |

### 4.2 Epics

Le backlog a été structuré en **huit epics**, chacune correspondant à un domaine fonctionnel ou technique cohérent :

| # | Epic | Périmètre principal |
|---|---|---|
| 1 | **Infrastructure & orchestration Kubernetes** | Provisionnement du cluster (3 nœuds ESXi), installation CNI Flannel, NGINX Ingress, gestion des PersistentVolumes statiques, namespaces |
| 2 | **Collecte des métriques et données de charge** | Déploiement node-exporter (DaemonSet), CronJob scraper Prometheus→PostgreSQL, endpoint `POST /api/metrics/ingest`, CronJob agrégateur (fenêtres 5 min/15 min/1 h) |
| 3 | **Module de prédiction IA (Ollama)** | Déploiement Ollama sur k8s-worker-1, sélection et test du modèle qwen2:0.5b, prediction-service (Express), intégration LLM avec parsing robuste et fallback |
| 4 | **API interne & logique décisionnelle** | Endpoints Next.js (`/predict`, `/forecast`, `/reserve`, `/release`, `/auto-reserve`, `/auto-release`), validation Zod, authentification JWT, middleware, rate limiting |
| 5 | **Réservation automatique des ressources** | CronJob `auto-reserve`, calcul des seuils (CPU > 80 %, RAM > 85 %), score composite de priorisation, mécanisme de cooldown (10 min), file d'attente `queued` |
| 6 | **Libération proactive des ressources** | CronJob `auto-release`, trois déclencheurs (expiration, chute de charge, fin de Job K8s), module de réallocation des réservations en attente |
| 7 | **Dashboard administrateur** | Frontend React/Next.js : pages dashboard (métriques temps réel, graphiques Recharts), prédictions (forecast multi-pas, LLMDrawer), réservations, namespaces |
| 8 | **Alertes & supervision** | Génération d'alertes en base (table `alerts`), intégration AlertManager, seuils configurables, affichage sur le dashboard |

### 4.3 Répartition du travail

| Membre | Périmètre principal |
|---|---|
| **Romain Barthélémy** | Infrastructure Kubernetes, pipeline de collecte, API Next.js, logique de réservation/libération, frontend, sécurité, tests |
| **Jean-Baptiste Raffi** | Déploiement Ollama, prediction-service (Express), intégration LLM, endpoints `/predict` et `/forecast` côté IA |

Le suivi des tickets JIRA a permis une coordination efficace malgré la séparation des responsabilités entre les deux modules (applicatif vs IA), en identifiant clairement les interfaces contractuelles entre les composants (ex. format de réponse du prediction-service, schéma de la table `predictions`).

---

## 5. Tests de validation

### 5.1 Tests automatisés

La suite de tests est implémentée avec **Jest** et **ts-jest**. Les fichiers de test couvrent :

| Fichier | Type | Ce qui est testé |
|---|---|---|
| `tests/api/reserve.test.ts` | Intégration | Validation du payload, comportement avec node inexistant, réponse en cas d'échec K8s |
| `tests/validators/reserve.test.ts` | Unitaire | Schéma Zod : types, bornes min/max, champs optionnels |
| `tests/services/kubernetes-reserve.test.ts` | Unitaire | `checkNodeCapacity`, `createResourceQuota`, `scaleDeployment` avec mocks K8s |
| `tests/lib/dashboard-data.test.ts` | Unitaire | Agrégation des métriques pour le tableau de bord |
| `tests/components/NodeCard.test.tsx` | Composant | Rendu des statuts CPU/RAM, affichage des alertes |
| `tests/components/StatusBadge.test.tsx` | Composant | Rendu conditionnel selon la sévérité |
| `tests/components/LLMDrawer.test.tsx` | Composant | Affichage des étapes LLM, ouverture/fermeture du drawer |

### 5.2 Tests manuels des endpoints

**Collecte et ingest :**
```bash
curl -s -X POST http://localhost:3000/api/metrics/ingest \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"node_id":"k8s-worker-1","collected_at":"2026-03-24T10:00:00Z","cpu_percent":45.2,"ram_percent":62.1,"disk_percent":30.0,"network_rx_mb":1.2,"network_tx_mb":0.8}'
# Réponse attendue : HTTP 201
```

**Prédiction :**
```bash
curl -s -X POST http://localhost:3000/api/predict \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"node_id":"k8s-worker-1","current_cpu_percent":45,"current_ram_percent":62,"current_disk_percent":30,"trend_direction":"up","prediction_horizon_minutes":60}'
# Réponse attendue : HTTP 201 avec predicted_cpu_percent, overload_risk, recommendation
```

**Réservation manuelle :**
```bash
curl -s -X POST http://localhost:3000/api/reserve \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"node_id":"k8s-worker-1","namespace":"app-production","deployment_name":"metrics-app","replica_count":2,"cpu_per_replica":0.5,"ram_per_replica":0.5,"duration_minutes":60}'
# Réponse attendue : HTTP 201 si capacité suffisante, 202 si mise en file d'attente
```

**Libération automatique :**
```bash
curl -s -X POST http://localhost:3000/api/auto-release \
  -H "Authorization: Bearer <TOKEN>"
# Réponse attendue : JSON avec expired[], load_dropped[], job_completed[], reallocated[]
```

**Vérification en base :**
```bash
kubectl port-forward svc/postgres 5432:5432 -n default
npx prisma studio
# Vérifier les tables metrics_raw, predictions, reservations, alerts
```

### 5.3 Scénario de bout en bout

Le scénario de validation complet suit le flux suivant :

1. Le scraper collecte les métriques depuis Prometheus et les insère dans `metrics_raw`.
2. L'agrégateur calcule les fenêtres 5 min/15 min/1 h dans `metrics_aggregated`.
3. Un appel à `/api/forecast` interroge le LLM et génère une prédiction enregistrée dans `predictions`.
4. Si le risque est élevé, une alerte est créée dans `alerts`.
5. Le CronJob `auto-reserve` détecte le dépassement de seuil et crée une réservation K8s active.
6. Une fois la charge retombée, le CronJob `auto-release` libère la réservation et tente de réactiver les réservations en file d'attente.
7. L'ensemble de ces états est visible en temps réel sur le tableau de bord.

---

## 6. Conclusion et perspectives

### 6.1 Bilan

Ce projet a permis de concevoir et déployer une plateforme complète de gestion prédictive des ressources Kubernetes, en couvrant l'ensemble de la chaîne : collecte des métriques, stockage temporel, prédiction par LLM embarqué, réservation/libération automatique et visualisation. Les principaux objectifs du cahier des charges sont atteints :

- La collecte temps réel fonctionne à la minute près via Prometheus et le scraper CronJob.
- Le module IA prédit la charge et génère des recommandations compréhensibles, sans nécessiter d'infrastructure GPU.
- La réservation automatique réagit aux dépassements de seuil avec un mécanisme anti-oscillation (cooldown).
- La libération automatique gère trois déclencheurs : expiration, chute de charge, fin de job Kubernetes.
- Le frontend offre une vue opérationnelle complète avec introspection du raisonnement LLM.

### 6.2 Limites actuelles

- **Précision du LLM** : le modèle qwen2:0.5b est compact et rapide, mais sa précision numérique reste inférieure à celle d'un modèle LSTM entraîné sur l'historique spécifique du cluster. Les prédictions sont des estimations d'ordre de grandeur plutôt que des valeurs exactes.
- **Cluster de développement** : l'infrastructure à trois nœuds avec ressources limitées (2–4 cœurs, 4–8 Go) ne reflète pas un environnement de production. Les comportements sous forte charge n'ont pas pu être validés.
- **Authentification** : l'authentification actuelle repose sur un couple username/password en variable d'environnement. Un système de gestion d'utilisateurs en base n'est pas encore implémenté.
- **Pas de tests E2E** : les tests automatisés couvrent les unités et composants, mais aucun test de parcours utilisateur complet n'est en place.

### 6.3 Perspectives d'évolution

- **Modèle hybride** : compléter le LLM avec un modèle statistique léger (EWMA ou Prophet) pour améliorer la précision sur les séries régulières, le LLM étant réservé à la génération des recommandations textuelles.
- **Entraînement incrémental** : collecter l'historique des prédictions et des valeurs réelles pour constituer un jeu de données et fine-tuner un modèle dédié au cluster.
- **Multi-tenancy** : étendre le système à plusieurs clusters ou namespaces avec isolation des données par tenant.
- **HPA natif** : intégrer les prédictions comme métriques custom dans le `HorizontalPodAutoscaler` Kubernetes pour une automatisation transparente.
- **Alerting push** : intégrer AlertManager pour envoyer les alertes critiques via Slack ou PagerDuty.
- **Tests E2E avec Playwright** : automatiser le parcours utilisateur complet (login → prédiction → réservation → libération).
