// Rate limiter in-memory — adapté à une instance unique (K8s single replica)

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

const WINDOW_MS = 60_000   // 1 minute
const MAX_REQUESTS = 60    // 60 req/min par IP

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || entry.resetAt <= now) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: now + WINDOW_MS }
  }

  if (entry.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { allowed: true, remaining: MAX_REQUESTS - entry.count, resetAt: entry.resetAt }
}
