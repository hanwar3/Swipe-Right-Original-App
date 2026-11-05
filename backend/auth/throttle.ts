import { api, APIError } from "encore.dev/api";
import { appMeta, currentRequest } from "encore.dev";
import { CronJob } from "encore.dev/cron";
import { authDB } from "./db";
import { sha256 } from "./tokens";

/**
 * Counts one attempt against `bucket` and refuses once there have been more
 * than `limit` in the current window. Backed by Postgres, so it holds across
 * instances and restarts.
 */
export async function throttle(bucket: string, limit: number, windowSeconds: number): Promise<void> {
  const row = await authDB.queryRow<{ attempts: number }>`
    INSERT INTO auth_throttle (bucket, attempts, window_start)
    VALUES (${sha256(bucket)}, 1, NOW())
    ON CONFLICT (bucket) DO UPDATE SET
      attempts = CASE
        WHEN auth_throttle.window_start < NOW() - ${windowSeconds}::int * INTERVAL '1 second' THEN 1
        ELSE auth_throttle.attempts + 1 END,
      window_start = CASE
        WHEN auth_throttle.window_start < NOW() - ${windowSeconds}::int * INTERVAL '1 second' THEN NOW()
        ELSE auth_throttle.window_start END
    RETURNING attempts
  `;
  if ((row?.attempts ?? 0) > limit) {
    throw APIError.resourceExhausted("Too many attempts. Wait a few minutes and try again.");
  }
}

// Locally every request comes from one address, so per-IP limits would only
// trip the test suite. Per-account limits stay on everywhere.
const LOCAL = appMeta().environment.cloud === "local";

/** Per-client-address limit for one action, e.g. throttleIp("login", 40, 900). */
export async function throttleIp(action: string, limit: number, windowSeconds: number): Promise<void> {
  if (LOCAL) return;
  await throttle(`${action}:ip:${clientIp()}`, limit, windowSeconds);
}

export async function clearThrottle(bucket: string): Promise<void> {
  await authDB.exec`DELETE FROM auth_throttle WHERE bucket = ${sha256(bucket)}`;
}

/** Best-effort client address for per-IP limits. Per-account limits do the real work. */
export function clientIp(): string {
  const req = currentRequest();
  if (!req || req.type !== "api-call") return "unknown";
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const forwarded = first(req.headers["x-forwarded-for"]).split(",")[0].trim();
  return forwarded || first(req.headers["x-real-ip"]).trim() || "unknown";
}

// Clears spent counters, used or expired reset links and pairing codes, and
// extension tokens that ended more than 30 days ago.
export const cleanup = api({ expose: false }, async (): Promise<void> => {
  await authDB.exec`DELETE FROM auth_throttle WHERE window_start < NOW() - INTERVAL '1 day'`;
  await authDB.exec`DELETE FROM password_reset_tokens WHERE used OR expires_at < NOW()`;
  await authDB.exec`DELETE FROM pairing_codes WHERE used_at IS NOT NULL OR expires_at < NOW()`;
  await authDB.exec`
    DELETE FROM api_tokens
    WHERE COALESCE(revoked_at, expires_at) < NOW() - INTERVAL '30 days'
  `;
});

const _ = new CronJob("auth-cleanup", {
  title: "Expire auth throttles, reset links, pairing codes and old extension tokens",
  every: "6h",
  endpoint: cleanup,
});
