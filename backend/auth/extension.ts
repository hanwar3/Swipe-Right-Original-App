import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { authDB } from "./db";
import { currentUserId } from "../lib/session";
import {
  EXTENSION_TOKEN_PREFIX,
  normalizePairingCode,
  pairingCode,
  randomToken,
  sha256,
} from "./tokens";
import { throttle, throttleIp } from "./throttle";

/*
 * Pairing the browser extension, without ever giving it a password:
 *   1. The signed-in app asks for a code and shows it (valid 10 minutes, one use).
 *   2. The user types it into the extension, which trades it for its own token.
 *   3. That token can only sync portal pages, lasts 180 days, and can be
 *      revoked from the app or by the extension itself.
 */

export interface PairingCodeResponse {
  code: string;
  expiresAt: string;
}

export const createPairingCode = api(
  { expose: true, auth: true, method: "POST", path: "/auth/extension/pairing-code" },
  async (): Promise<PairingCodeResponse> => {
    const userId = currentUserId();
    await throttle(`pairing-code:${userId}`, 10, 60 * 60);
    const code = pairingCode();
    await authDB.exec`DELETE FROM pairing_codes WHERE user_id = ${userId}::uuid`;
    const row = await authDB.queryRow`
      INSERT INTO pairing_codes (code_hash, user_id, expires_at)
      VALUES (${sha256(code)}, ${userId}::uuid, NOW() + INTERVAL '10 minutes')
      RETURNING expires_at
    `;
    return { code, expiresAt: new Date(row!.expires_at).toISOString() };
  }
);

export interface PairRequest {
  code: string;
  /** Shown in the app's list of connected browsers, e.g. "Chrome on MacBook". */
  label?: string;
}

export interface PairResponse {
  token: string;
  expiresAt: string;
  email: string;
}

export const pairExtension = api<PairRequest, PairResponse>(
  { expose: true, method: "POST", path: "/auth/extension/pair", sensitive: true },
  async (req) => {
    // 31^8 codes, 10 minutes, 10 tries per IP per 10 minutes: not guessable.
    await throttleIp("pair", 10, 10 * 60);
    const code = normalizePairingCode(req.code);
    const claimed = await authDB.queryRow<{ user_id: string; email: string }>`
      UPDATE pairing_codes p SET used_at = NOW()
      FROM users u
      WHERE p.code_hash = ${sha256(code)}
        AND p.used_at IS NULL
        AND p.expires_at > NOW()
        AND u.user_id = p.user_id
      RETURNING p.user_id::text AS user_id, u.email
    `;
    if (!claimed) throw APIError.invalidArgument("That code is wrong or has expired. Get a new one in the app.");

    const token = randomToken(EXTENSION_TOKEN_PREFIX);
    const label = (typeof req.label === "string" ? req.label.replace(/[\u0000-\u001f\u007f]/g, "").trim() : "")
      .slice(0, 60) || "Browser extension";
    const row = await authDB.queryRow`
      INSERT INTO api_tokens (user_id, token_hash, label, expires_at)
      VALUES (${claimed.user_id}::uuid, ${sha256(token)}, ${label}, NOW() + INTERVAL '180 days')
      RETURNING expires_at
    `;
    return { token, expiresAt: new Date(row!.expires_at).toISOString(), email: claimed.email };
  }
);

export interface ExtensionDevice {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt: string;
}

export const listExtensions = api(
  { expose: true, auth: true, method: "GET", path: "/auth/extension/devices" },
  async (): Promise<{ devices: ExtensionDevice[] }> => {
    const userId = currentUserId();
    const rows = await authDB.queryAll`
      SELECT id::text AS id, label, created_at, last_used_at, expires_at
      FROM api_tokens
      WHERE user_id = ${userId}::uuid AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
    `;
    return {
      devices: rows.map((r) => ({
        id: r.id,
        label: r.label,
        createdAt: new Date(r.created_at).toISOString(),
        lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : undefined,
        expiresAt: new Date(r.expires_at).toISOString(),
      })),
    };
  }
);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const revokeExtension = api<{ id: string }, { revoked: boolean }>(
  { expose: true, auth: true, method: "POST", path: "/auth/extension/devices/:id/revoke" },
  async ({ id }) => {
    const userId = currentUserId();
    if (!UUID.test(id)) throw APIError.notFound("No such extension");
    const row = await authDB.queryRow`
      UPDATE api_tokens SET revoked_at = NOW()
      WHERE id = ${id}::uuid AND user_id = ${userId}::uuid AND revoked_at IS NULL
      RETURNING id
    `;
    if (!row) throw APIError.notFound("No such extension");
    return { revoked: true };
  }
);

// Called by the extension's "Disconnect" button with its own token.
export const unpairSelf = api(
  { expose: true, auth: true, method: "POST", path: "/auth/extension/unpair" },
  async (): Promise<{ revoked: boolean }> => {
    currentUserId({ allowExtension: true });
    const data = getAuthData();
    if (data?.kind !== "extension" || !data.tokenId) {
      throw APIError.failedPrecondition("Only a paired extension can unpair itself");
    }
    await authDB.exec`UPDATE api_tokens SET revoked_at = NOW() WHERE id = ${data.tokenId}::uuid`;
    return { revoked: true };
  }
);
