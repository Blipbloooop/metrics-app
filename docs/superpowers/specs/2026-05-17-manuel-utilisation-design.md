# Design — Manuel d'utilisation metrics-app

**Date :** 2026-05-17
**Auteur :** jibé
**Statut :** Approuvé

---

## Contexte

Livrable final du cours : fournir un manuel d'utilisation à remettre avec le code, les configs et les prompts IA. Le prof a demandé explicitement : détail de la prédiction, justification LLM vs réseau de neurones, scénario de charge de pointe.

## Décisions

| Critère | Choix |
|---------|-------|
| Public cible | Développeur/ops qui reprend le projet |
| Format livrable | Document Word/PDF (rédigé en Markdown, exporté) |
| Langue | Français |
| Structure | Hybride : pédagogique + déploiement + usage |
| Longueur cible | ~20-25 pages |

## Structure validée

### 1. Page de titre & introduction
- Titre, auteurs, date, cours
- Résumé du projet en 5 lignes

### 2. Architecture et choix techniques
- **2.1** Vue d'ensemble : schéma des composants (Next.js, prediction-service, Ollama, Prometheus, PostgreSQL, K8s) + interactions
- **2.2** Système de prédiction : pipeline Prometheus → historique → prompts → Ollama qwen2:0.5b → prédiction multi-pas auto-régressive. Prompts réels inclus.
- **2.3** Pourquoi LLM et non réseau de neurones classique : comparaison LSTM/RNN vs LLM, arguments (pas de training data, raisonnement symbolique, flexibilité du prompt, déploiement simple), limites honnêtes (précision, latence)
- **2.4** Scénario de charge de pointe : k8s-worker-1 à 85% CPU à 9h, forecast qui anticipe la hausse, alerte medium/high, action suggérée

### 3. Prérequis et installation
- Matériel (3 VMs Linux, 4 GB RAM min par nœud)
- Logiciels : Docker, kubeadm/kubectl, Helm
- Réseau : IPs fixes, /etc/hosts
- Clone du repo

### 4. Déploiement complet pas à pas
Ordre : PostgreSQL → Next.js app → CronJobs → Ollama → prediction-service
Chaque composant : commande exacte + vérification `kubectl get pods`

### 5. Guide utilisateur des fonctionnalités
- Connexion (login admin)
- Dashboard : métriques temps réel par nœud
- Panel de prédiction : lancer un forecast, lire les résultats, interpréter
- Réservation manuelle de ressources
- Alertes et événements K8s

### 6. Annexes
- Prompts IA utilisés verbatim (/predict + /forecast)
- Variables d'environnement
- Commandes de diagnostic (`kubectl logs`, `kubectl describe`)

## Fichier de sortie

`docs/manuel-utilisation.md` — sera exporté en PDF/Word pour la remise.
