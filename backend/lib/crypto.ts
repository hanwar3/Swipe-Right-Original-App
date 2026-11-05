import { timingSafeEqual } from "node:crypto";

/** Constant-time string comparison, so response timing leaks nothing about a secret. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}
