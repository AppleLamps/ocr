/**
 * Lightweight in-memory rate limiter for the OCR API route.
 *
 * The OCR endpoint forwards every request to Z.AI's paid GLM-OCR API, so an
 * unthrottled public endpoint is a direct financial risk. This guards against
 * casual abuse without requiring external infrastructure.
 *
 * Note: state lives in the process memory of a single instance. On a
 * horizontally-scaled / serverless deployment each instance keeps its own
 * counters, so this is a first line of defense, not a distributed quota. For
 * stricter guarantees back it with a shared store (e.g. Vercel KV / Upstash).
 */

export const RATE_LIMIT_WINDOW_MS = Number(
  process.env.OCR_RATE_LIMIT_WINDOW_MS ?? 60_000
)
export const RATE_LIMIT_MAX_REQUESTS = Number(
  process.env.OCR_RATE_LIMIT_MAX ?? 10
)

type WindowState = { count: number; resetAt: number }

const hits = new Map<string, WindowState>()

export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  /** Seconds until the window resets (useful for a Retry-After header). */
  retryAfterSeconds: number
}

/** Drop expired windows so the map does not grow without bound. */
function evictExpired(now: number): void {
  Array.from(hits.entries()).forEach(([key, state]) => {
    if (state.resetAt <= now) hits.delete(key)
  })
}

/**
 * Record a hit for `identifier` and report whether it is within the limit.
 * Uses a fixed-window counter keyed by caller identity (typically client IP).
 */
export function checkRateLimit(
  identifier: string,
  options?: { windowMs?: number; max?: number; now?: number }
): RateLimitResult {
  const windowMs = options?.windowMs ?? RATE_LIMIT_WINDOW_MS
  const max = options?.max ?? RATE_LIMIT_MAX_REQUESTS
  const now = options?.now ?? Date.now()

  // Opportunistic cleanup keeps memory bounded under many distinct callers.
  if (hits.size > 5000) evictExpired(now)

  const existing = hits.get(identifier)
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs
    hits.set(identifier, { count: 1, resetAt })
    return {
      allowed: true,
      limit: max,
      remaining: max - 1,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  existing.count += 1
  const remaining = Math.max(0, max - existing.count)
  return {
    allowed: existing.count <= max,
    limit: max,
    remaining,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}

/** Best-effort client IP from common proxy headers (Vercel sets these). */
export function getClientIdentifier(headers: Headers): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

/** Test/maintenance helper to clear all counters. */
export function resetRateLimiter(): void {
  hits.clear()
}
