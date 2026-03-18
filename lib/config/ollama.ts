/**
 * Configuration des prompts et options Ollama (PRV-26)
 *
 * Ce fichier centralise :
 * - Les templates de prompt envoyés au prediction-service
 * - Les options Ollama (temperature, num_predict, stream)
 *
 * Toutes les valeurs sont configurables via variables d'environnement.
 * Le prediction-service (Express, maintenu par Romain) doit lire
 * le champ "ollama_options" du payload pour les appliquer à Ollama.
 *
 * Variables d'environnement disponibles :
 *   OLLAMA_MODEL          - Modèle utilisé (défaut: qwen2:0.5b)
 *   OLLAMA_TEMPERATURE    - Température d'inférence, 0.0-1.0 (défaut: 0.1)
 *   OLLAMA_NUM_PREDICT    - Tokens max générés, 128-512 (défaut: 256)
 *   OLLAMA_STREAM         - Streaming de la réponse (défaut: false)
 */

// ─────────────────────────────────────────
// Options Ollama
// ─────────────────────────────────────────

export const ollamaConfig = {
  model: process.env.OLLAMA_MODEL ?? 'qwen2:0.5b',
  temperature: Number(process.env.OLLAMA_TEMPERATURE ?? 0.1),
  num_predict: Number(process.env.OLLAMA_NUM_PREDICT ?? 256),
  stream: process.env.OLLAMA_STREAM === 'true',
}

// ─────────────────────────────────────────
// Templates de prompt
// ─────────────────────────────────────────

/**
 * Prompt pour /predict (entrée manuelle, prédiction ponctuelle)
 *
 * Variables injectées :
 *   {node}        - ID du nœud (ex: k8s-worker-1)
 *   {cpu}         - CPU actuel en %
 *   {ram}         - RAM actuelle en %
 *   {disk}        - Disque actuel en %
 *   {trend}       - Direction de la tendance (up/down/stable)
 *   {horizon}     - Horizon de prédiction en minutes
 *   {scenario}    - Description du scénario (optionnel)
 */
export const PREDICT_PROMPT_TEMPLATE = `You are a Kubernetes resource prediction system.
Analyze the current metrics for node {node} and predict resource usage in {horizon} minutes.

Current state:
- CPU: {cpu}%
- RAM: {ram}%
- Disk: {disk}%
- Trend: {trend}
{scenario}

Respond ONLY with valid JSON:
{
  "predicted_cpu_percent": <number 0-100>,
  "predicted_ram_percent": <number 0-100>,
  "predicted_disk_percent": <number 0-100>,
  "overload_risk": <number 0.0-1.0>,
  "confidence": <number 0.0-1.0>,
  "recommendation": "<string>"
}`

/**
 * Prompt pour /forecast (prédiction itérative, un appel par pas)
 *
 * Variables injectées :
 *   {node}         - ID du nœud
 *   {cpu_history}  - Historique CPU (tableau JSON, ex: [45,52,60,71])
 *   {ram_history}  - Historique RAM (tableau JSON, ex: [55,58,62,68])
 *   {step_minutes} - Taille d'un pas en minutes
 *   {step_number}  - Numéro du pas actuel
 *   {total_steps}  - Nombre total de pas
 */
export const FORECAST_PROMPT_TEMPLATE = `You are a Kubernetes resource forecasting system.
Based on the historical metrics for node {node}, predict the NEXT {step_minutes}-minute step.

This is step {step_number} of {total_steps}.

CPU history (chronological, %): {cpu_history}
RAM history (chronological, %): {ram_history}

Predict the next values. Respond ONLY with valid JSON:
{
  "predicted_cpu_percent": <number 0-100>,
  "predicted_ram_percent": <number 0-100>
}`

/**
 * Construit le payload complet pour le prediction-service /predict
 */
const SEND_OLLAMA_CONFIG = process.env.SEND_OLLAMA_CONFIG === 'true'

export function buildPredictPayload(input: {
  node_id: string
  current_cpu_percent: number
  current_ram_percent: number
  current_disk_percent: number
  trend_direction: string
  prediction_horizon_minutes: number
  scenario_description?: string
}) {
  return {
    ...input,
    ...(SEND_OLLAMA_CONFIG && {
      prompt_template: PREDICT_PROMPT_TEMPLATE,
      ollama_options: {
        model: ollamaConfig.model,
        temperature: ollamaConfig.temperature,
        num_predict: ollamaConfig.num_predict,
        stream: ollamaConfig.stream,
      },
    }),
  }
}

/**
 * Construit le payload complet pour le prediction-service /forecast
 */
export function buildForecastPayload(input: {
  node: string
  cpu_history: number[]
  ram_history: number[]
  horizon_minutes: number
  step_minutes: number
}) {
  return {
    node: input.node,
    cpu_history: input.cpu_history,
    ram_history: input.ram_history,
    horizon_minutes: input.horizon_minutes,
    step_minutes: input.step_minutes,
    ...(SEND_OLLAMA_CONFIG && {
      prompt_template: FORECAST_PROMPT_TEMPLATE,
      ollama_options: {
        model: ollamaConfig.model,
        temperature: ollamaConfig.temperature,
        num_predict: ollamaConfig.num_predict,
        stream: ollamaConfig.stream,
      },
    }),
  }
}
