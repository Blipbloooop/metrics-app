/**
 * Utilitaires de normalisation des métriques Kubernetes
 * Convertit les valeurs brutes de l'API K8s en unités lisibles
 */

/**
 * Normaliser une valeur CPU Kubernetes
 * Formats possibles: "100m" (millicores), "1" (cores), "250000n" (nanocores)
 * Retourne la valeur en cores (float)
 */
function normalizeCpu(value: string, _format: string): number {
  if (!value || value === "0") return 0;

  if (value.endsWith("n")) {
    // Nanocores → cores
    return parseInt(value.slice(0, -1), 10) / 1e9;
  } else if (value.endsWith("m")) {
    // Millicores → cores
    return parseInt(value.slice(0, -1), 10) / 1000;
  } else {
    // Cores directement
    const result = parseFloat(value);
    return isNaN(result) ? 0 : result;
  }
}

/**
 * Normaliser une valeur mémoire Kubernetes
 * Formats possibles: "128974848" (bytes), "1Gi", "256Mi", "1024Ki"
 * Retourne la valeur en MB (float)
 */
function normalizeMemory(value: string, _format: string): number {
  if (!value || value === "0") return 0;

  if (value.endsWith("Ki")) {
    return parseInt(value.slice(0, -2), 10) / 1024;
  } else if (value.endsWith("Mi")) {
    return parseInt(value.slice(0, -2), 10);
  } else if (value.endsWith("Gi")) {
    return parseInt(value.slice(0, -2), 10) * 1024;
  } else if (value.endsWith("Ti")) {
    return parseInt(value.slice(0, -2), 10) * 1024 * 1024;
  } else {
    // Bytes → MB
    return parseInt(value, 10) / (1024 * 1024);
  }
}

/**
 * Normaliser une valeur réseau (bytes → MB)
 */
function normalizeNetwork(value: string, _format: string): number {
  if (!value || value === "0") return 0;
  return parseInt(value, 10) / (1024 * 1024);
}

/**
 * Normaliser une valeur I/O (bytes → MB)
 */
function normalizeIo(value: string, _format: string): number {
  if (!value || value === "0") return 0;
  return parseInt(value, 10) / (1024 * 1024);
}

export const normalizeMetrics = {
  cpu: normalizeCpu,
  memory: normalizeMemory,
  network: normalizeNetwork,
  io: normalizeIo,
};
