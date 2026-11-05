import { api, APIError } from "encore.dev/api";
import { authDB } from "./db";
import { signSession } from "./tokens";
import { clearThrottle, throttle, throttleIp } from "./throttle";
import { toUser, verifyPassword } from "./user";
import type { RegisterResponse } from "./register";

export interface LoginRequest {
  email: string;
  password: string;
}

const INVALID = "Invalid email or password";

// Signs in with email and password.
export const login = api<LoginRequest, RegisterResponse>(
  { expose: true, method: "POST", path: "/auth/login", sensitive: true },
  async (req) => {
    const email = typeof req.email === "string" ? req.email.trim().toLowerCase().slice(0, 254) : "";

    // Per address: stops guessing one account's password. Per IP: stops spraying many.
    await throttleIp("login", 40, 15 * 60);
    await throttle(`login:email:${email}`, 8, 15 * 60);

    const row = email
      ? await authDB.queryRow`
          SELECT user_id, email, password_hash, first_name, last_name, profile_picture_url,
                 auth_provider, email_verified, created_at, session_version
          FROM users WHERE email = ${email}
        `
      : null;

    // Same message and the same bcrypt cost whether the account is missing,
    // has no password (social) or the password is wrong.
    const ok = await verifyPassword(req.password, row?.password_hash);
    if (!row || !ok) throw APIError.unauthenticated(INVALID);

    await clearThrottle(`login:email:${email}`);
    const updated = await authDB.queryRow`
      UPDATE users SET last_login = NOW() WHERE user_id = ${row.user_id} RETURNING last_login
    `;
    return {
      user: toUser({ ...row, last_login: updated?.last_login }),
      token: signSession(row.user_id, row.session_version),
    };
  }
);
