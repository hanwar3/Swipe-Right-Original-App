import { APIError } from "encore.dev/api";

/**
 * In-process sliding-window limiter for calls that cost money (Gemini) rather
 * than calls that guard secrets (those use the Postgres-backed throttle in
 * auth/throttle.ts). Per instance, which is the right trade for cost control:
 * no database write on every question.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number, message?: string): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    throw APIError.resourceExhausted(message ?? "You're going a bit fast. Try again in a minute.");
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 50_000) {
    // Bounded memory: drop the oldest keys if someone sprays new ones.
    for (const k of hits.keys()) {
      hits.delete(k);
      if (hits.size <= 40_000) break;
    }
  }
}
