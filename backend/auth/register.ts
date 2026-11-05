import { api, APIError } from "encore.dev/api";
import bcrypt from "bcryptjs";
import { authDB } from "./db";
import { signSession } from "./tokens";
import { throttleIp } from "./throttle";
import { BCRYPT_COST, checkPassword, cleanName, normalizeEmail, toUser } from "./user";

export interface RegisterRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface User {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
  authProvider: string;
  emailVerified: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface RegisterResponse {
  user: User;
  token: string;
}

// Creates an account with email and password and signs it in.
export const register = api<RegisterRequest, RegisterResponse>(
  { expose: true, method: "POST", path: "/auth/register", sensitive: true },
  async (req) => {
    await throttleIp("register", 10, 60 * 60);
    const email = normalizeEmail(req.email);
    const password = checkPassword(req.password, email);
    const hash = await bcrypt.hash(password, BCRYPT_COST);

    // ON CONFLICT closes the race between two signups for one address.
    const row = await authDB.queryRow`
      INSERT INTO users (email, password_hash, first_name, last_name, auth_provider, last_login)
      VALUES (${email}, ${hash}, ${cleanName(req.firstName)}, ${cleanName(req.lastName)}, 'email', NOW())
      ON CONFLICT (email) DO NOTHING
      RETURNING user_id, email, first_name, last_name, profile_picture_url, auth_provider,
                email_verified, created_at, last_login, session_version
    `;
    if (!row) throw APIError.alreadyExists("An account with this email already exists. Sign in instead.");

    return { user: toUser(row), token: signSession(row.user_id, row.session_version) };
  }
);
