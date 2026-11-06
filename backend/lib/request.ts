import { currentRequest } from "encore.dev";

/** Best-effort client address, for per-IP limits on public endpoints. */
export function clientIp(): string {
  const req = currentRequest();
  if (!req || req.type !== "api-call") return "unknown";
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const forwarded = first(req.headers["x-forwarded-for"]).split(",")[0].trim();
  return forwarded || first(req.headers["x-real-ip"]).trim() || "unknown";
}
