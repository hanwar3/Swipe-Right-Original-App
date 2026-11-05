import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";
import bcrypt from "bcryptjs";
import { authDB } from "./db";
import { randomToken, sha256 } from "./tokens";
import { throttle, throttleIp } from "./throttle";
import { BCRYPT_COST, checkPassword, normalizeEmail } from "./user";

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

const SENT = "If an account with this email exists, you will receive a password reset link.";

/**
 * Delivers the reset link. No email provider is connected yet, so this only
 * records that a reset was asked for (never the link or the address). The app
 * hides "Forgot password?" until this sends real mail; see docs/DEPLOY.md.
 */
async function sendResetEmail(_email: string, _link: string): Promise<boolean> {
  log.warn("password reset requested but no email provider is configured");
  return false;
}

// Starts a reset. Answers the same way whether or not the account exists.
export const forgotPassword = api<ForgotPasswordRequest, { message: string }>(
  { expose: true, method: "POST", path: "/auth/forgot-password", sensitive: true },
  async (req) => {
    await throttleIp("forgot", 10, 60 * 60);
    let email: string;
    try {
      email = normalizeEmail(req.email);
    } catch {
      return { message: SENT };
    }
    await throttle(`forgot:email:${email}`, 3, 60 * 60);

    const user = await authDB.queryRow`
      SELECT user_id FROM users WHERE email = ${email} AND password_hash IS NOT NULL
    `;
    if (!user) return { message: SENT };

    // One live link per account, valid for 30 minutes, stored only as a hash.
    const token = randomToken();
    await authDB.exec`DELETE FROM password_reset_tokens WHERE user_id = ${user.user_id}`;
    await authDB.exec`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${user.user_id}, ${sha256(token)}, NOW() + INTERVAL '30 minutes')
    `;
    await sendResetEmail(email, `/reset-password?token=${token}`);
    return { message: SENT };
  }
);

// Sets a new password from a reset link and signs the account out everywhere.
export const resetPassword = api<ResetPasswordRequest, { message: string }>(
  { expose: true, method: "POST", path: "/auth/reset-password", sensitive: true },
  async (req) => {
    await throttleIp("reset", 20, 60 * 60);
    const hash = sha256(typeof req.token === "string" ? req.token : "");

    const pending = await authDB.queryRow`
      SELECT t.id, u.user_id, u.email
      FROM password_reset_tokens t JOIN users u ON u.user_id = t.user_id
      WHERE t.token_hash = ${hash} AND NOT t.used AND t.expires_at > NOW()
    `;
    if (!pending) throw APIError.invalidArgument("This reset link is invalid or has expired");

    // Check the new password before spending the link, so a weak choice can be retried.
    const password = checkPassword(req.newPassword, pending.email);
    const claimed = await authDB.queryRow`
      UPDATE password_reset_tokens SET used = true
      WHERE id = ${pending.id} AND NOT used
      RETURNING id
    `;
    if (!claimed) throw APIError.invalidArgument("This reset link has already been used");

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    await authDB.exec`
      UPDATE users
      SET password_hash = ${passwordHash},
          session_version = session_version + 1,
          updated_at = NOW()
      WHERE user_id = ${pending.user_id}
    `;
    return { message: "Password updated. Sign in with your new password." };
  }
);
