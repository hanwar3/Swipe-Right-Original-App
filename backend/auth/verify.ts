import { api, APIError } from "encore.dev/api";
import { authDB } from "./db";
import { SESSION_REFRESH_AFTER_SECONDS, signSession, verifySession } from "./tokens";
import { toUser } from "./user";
import type { User } from "./register";

export interface VerifyTokenRequest {
  token: string;
}

export interface VerifyTokenResponse {
  user: User;
  /** A replacement token when the one sent is more than a day old. Store it. */
  token?: string;
}

const ENDED = "Your session has ended. Sign in again.";

// Checks a session token's signature, expiry and revocation, and returns its user.
export const verifyToken = api<VerifyTokenRequest, VerifyTokenResponse>(
  { expose: true, method: "POST", path: "/auth/verify", sensitive: true },
  async ({ token }) => {
    const claims = verifySession(token);
    if (!claims) throw APIError.unauthenticated(ENDED);

    const row = await authDB.queryRow`
      SELECT user_id, email, first_name, last_name, profile_picture_url, auth_provider,
             email_verified, created_at, last_login, session_version
      FROM users WHERE user_id = ${claims.sub}::uuid
    `;
    if (!row || row.session_version !== claims.sv) throw APIError.unauthenticated(ENDED);

    // Sliding sessions: someone who opens the app weekly stays signed in.
    const age = Date.now() / 1000 - claims.iat;
    const fresh = age > SESSION_REFRESH_AFTER_SECONDS ? signSession(claims.sub, row.session_version) : undefined;
    return { user: toUser(row), token: fresh };
  }
);
