/**
 * Évaluation du risque de surcharge (PRV-24)
 *
 * Règles déterministes basées sur les pics CPU/RAM prédits.
 * Seuils configurables via variables d'environnement.
 */

// Seuils CPU (%)
const CPU_MEDIUM = Number(process.env.RISK_CPU_MEDIUM ?? 80)
const CPU_HIGH = Number(process.env.RISK_CPU_HIGH ?? 90)

// Seuils RAM (%)
const RAM_MEDIUM = Number(process.env.RISK_RAM_MEDIUM ?? 85)
const RAM_HIGH = Number(process.env.RISK_RAM_HIGH ?? 95)

export type RiskLevel = 'low' | 'medium' | 'high'

export interface RiskAssessment {
  level: RiskLevel
  score: number // 0.0 - 1.0
  reasons: string[]
  thresholds: {
    cpu_medium: number
    cpu_high: number
    ram_medium: number
    ram_high: number
  }
  recommendation: string
}

export function assessRisk(cpuPeak: number, ramPeak: number): RiskAssessment {
  const reasons: string[] = []
  let level: RiskLevel = 'low'
  let score = 0.2

  // Évaluation CPU
  if (cpuPeak > CPU_HIGH) {
    reasons.push(`CPU peak ${cpuPeak}% dépasse le seuil critique (${CPU_HIGH}%)`)
    level = 'high'
    score = 1.0
  } else if (cpuPeak > CPU_MEDIUM) {
    reasons.push(`CPU peak ${cpuPeak}% dépasse le seuil d'alerte (${CPU_MEDIUM}%)`)
    level = 'medium'
    score = 0.6
  }

  // Évaluation RAM (peut élever le niveau mais jamais le baisser)
  if (ramPeak > RAM_HIGH) {
    reasons.push(`RAM peak ${ramPeak}% dépasse le seuil critique (${RAM_HIGH}%)`)
    level = 'high'
    score = 1.0
  } else if (ramPeak > RAM_MEDIUM) {
    reasons.push(`RAM peak ${ramPeak}% dépasse le seuil d'alerte (${RAM_MEDIUM}%)`)
    if (level === 'low') level = 'medium'
    if (score < 0.6) score = 0.6
  }

  if (reasons.length === 0) {
    reasons.push('Charge normale prévue, aucun seuil dépassé')
  }

  return {
    level,
    score,
    reasons,
    thresholds: {
      cpu_medium: CPU_MEDIUM,
      cpu_high: CPU_HIGH,
      ram_medium: RAM_MEDIUM,
      ram_high: RAM_HIGH,
    },
    recommendation: buildRecommendation(level, cpuPeak, ramPeak),
  }
}

function buildRecommendation(level: RiskLevel, cpuPeak: number, ramPeak: number): string {
  switch (level) {
    case 'high':
      return `Surcharge critique prévue (CPU: ${cpuPeak}%, RAM: ${ramPeak}%). Réservation de ressources recommandée immédiatement.`
    case 'medium':
      return `Charge élevée prévue (CPU: ${cpuPeak}%, RAM: ${ramPeak}%). Surveiller et préparer une réservation préventive.`
    default:
      return `Charge normale prévue (CPU: ${cpuPeak}%, RAM: ${ramPeak}%). Aucune action requise.`
  }
}
