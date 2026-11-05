import { secret } from "encore.dev/config";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { safeEqual } from "../lib/crypto";

export { safeEqual };

// HMAC key for session tokens. At least 32 random characters, set per environment:
//   encore secret set --type prod,dev,local SessionSecret
const sessionSecret = secret("SessionSecret");

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
/** Tokens older than this are swapped for a fresh one when the app checks in. */
export const SESSION_REFRESH_AFTER_SECONDS = 24 * 60 * 60;
/** Extension tokens start with this, so the auth handler can tell them apart. */
export const EXTENSION_TOKEN_PREFIX = "srx_";

export interface SessionClaims {
  /** User id. */
  sub: string;
  /** Must match users.session_version, or the token has been revoked. */
  sv: number;
  iat: number;
  exp: number;
  typ: "session";
}

// A standard HS256 JWT. The header is pinned, which rules out "alg: none"
// and algorithm-confusion tricks without parsing it.
const HEADER = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

function key(): Buffer {
  const value = sessionSecret();
  if (!value || value.length < 32) {
    throw new Error("SessionSecret is missing or shorter than 32 characters");
  }
  return Buffer.from(value, "utf8");
}

function mac(data: string): string {
  return createHmac("sha256", key()).update(data).digest("base64url");
}

function b64url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

export function signSession(userId: string, sessionVersion: number, nowMs = Date.now()): string {
  const iat = Math.floor(nowMs / 1000);
  const claims: SessionClaims = {
    sub: userId,
    sv: sessionVersion,
    iat,
    exp: iat + SESSION_TTL_SECONDS,
    typ: "session",
  };
  const body = `${HEADER}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${mac(body)}`;
}

/** Returns the claims of a well-formed, correctly signed, unexpired token, else null. */
export function verifySession(token: unknown, nowMs = Date.now()): SessionClaims | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  if (!safeEqual(parts[2], mac(`${parts[0]}.${parts[1]}`))) return null;

  let claims: Partial<SessionClaims>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    claims?.typ !== "session" ||
    typeof claims.sub !== "string" ||
    typeof claims.sv !== "number" ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number"
  ) {
    return null;
  }
  if (claims.exp * 1000 <= nowMs) return null;
  return claims as SessionClaims;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** An unguessable secret for reset links and extension tokens. Store only its sha256. */
export function randomToken(prefix = "", bytes = 32): string {
  return prefix + randomBytes(bytes).toString("base64url");
}

// No 0/O, 1/I/L, so a code read off a phone screen types back correctly.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** An 8-character pairing code shown as XXXX-XXXX. */
export function pairingCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

/** Undo what people do when typing a code: spaces, lowercase, a missing dash. */
export function normalizePairingCode(raw: string): string {
  const clean = (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}
