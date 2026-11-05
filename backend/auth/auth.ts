import { APIError, Gateway, Header } from "encore.dev/api";
import { authHandler } from "encore.dev/auth";
import { authDB } from "./db";
import { EXTENSION_TOKEN_PREFIX, sha256, verifySession } from "./tokens";

interface AuthParams {
  authorization: Header<"Authorization">;
}

export interface AuthData {
  userID: string;
  email: string;
  /**
   * "session" is the signed-in app. "extension" is a paired browser extension,
   * which may only sync portal pages (see lib/session.ts).
   */
  kind: "session" | "extension";
  /** The api_tokens row behind an extension request, so it can unpair itself. */
  tokenId?: string;
}

const ENDED = "Your session has ended. Sign in again.";

// Every endpoint marked `auth: true` runs this first. Endpoints never take a
// user id from the request: they read the one proven here.
export const auth = authHandler<AuthParams, AuthData>(async ({ authorization }) => {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!match) throw APIError.unauthenticated("Sign in to continue");
  const token = match[1];

  if (token.startsWith(EXTENSION_TOKEN_PREFIX)) {
    const row = await authDB.queryRow<{ id: string; user_id: string; email: string }>`
      UPDATE api_tokens t SET last_used_at = NOW()
      FROM users u
      WHERE t.token_hash = ${sha256(token)}
        AND t.revoked_at IS NULL
        AND t.expires_at > NOW()
        AND u.user_id = t.user_id
      RETURNING t.id::text AS id, t.user_id::text AS user_id, u.email
    `;
    if (!row) throw APIError.unauthenticated("This extension is no longer connected. Pair it again from the app.");
    return { userID: row.user_id, email: row.email, kind: "extension", tokenId: row.id };
  }

  const claims = verifySession(token);
  if (!claims) throw APIError.unauthenticated(ENDED);
  const row = await authDB.queryRow<{ email: string; session_version: number }>`
    SELECT email, session_version FROM users WHERE user_id = ${claims.sub}::uuid
  `;
  // A bumped session_version (reset, sign out everywhere) voids older tokens.
  if (!row || row.session_version !== claims.sv) throw APIError.unauthenticated(ENDED);
  return { userID: claims.sub, email: row.email, kind: "session" };
});

export const gateway = new Gateway({ authHandler: auth });
