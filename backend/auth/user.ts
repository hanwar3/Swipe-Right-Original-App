import { APIError } from "encore.dev/api";
import bcrypt from "bcryptjs";
import type { User } from "./register";

export const BCRYPT_COST = 12;

/** Maps a users row to the public shape. Never includes hashes or session state. */
export function toUser(row: Record<string, any>): User {
  return {
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    profilePictureUrl: row.profile_picture_url ?? undefined,
    authProvider: row.auth_provider,
    emailVerified: !!row.email_verified,
    createdAt: new Date(row.created_at).toISOString(),
    lastLogin: row.last_login ? new Date(row.last_login).toISOString() : undefined,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trimmed, lowercased, validated. */
export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (email.length > 254 || !EMAIL.test(email)) {
    throw APIError.invalidArgument("Enter a valid email address");
  }
  return email;
}

// The handful of choices that make up most real-world password guesses.
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd",
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000",
  "qwerty12", "qwerty123", "qwertyuiop", "1q2w3e4r", "abc12345", "abcd1234",
  "iloveyou", "letmein1", "welcome1", "sunshine", "baseball", "football",
  "superman", "trustno1", "swiperight", "creditcard", "cashback1",
]);

/** NIST 800-63B style: length over composition rules, and no known-weak choices. */
export function checkPassword(password: unknown, email?: string): string {
  if (typeof password !== "string" || password.length < 8) {
    throw APIError.invalidArgument("Use at least 8 characters for your password");
  }
  // bcrypt only reads the first 72 bytes; refuse rather than silently truncate.
  if (Buffer.byteLength(password, "utf8") > 72) {
    throw APIError.invalidArgument("Use 72 characters or fewer for your password");
  }
  const lower = password.toLowerCase();
  const local = email?.split("@")[0]?.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password) || (local && lower.includes(local) && local.length >= 4)) {
    throw APIError.invalidArgument("That password is too easy to guess. Try a longer phrase");
  }
  return password;
}

/** Display names: trimmed, control characters removed, capped, empty becomes null. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100);
  return name || null;
}

let dummy: Promise<string> | null = null;

/**
 * Compares against a throwaway hash when there is no account, so a missing
 * email takes as long to reject as a wrong password.
 */
export async function verifyPassword(password: unknown, hash: string | null | undefined): Promise<boolean> {
  const candidate = typeof password === "string" && password.length <= 1024 ? password : "";
  if (!hash) {
    dummy ??= bcrypt.hash("timing-equaliser-not-a-password", BCRYPT_COST);
    await bcrypt.compare(candidate, await dummy);
    return false;
  }
  return candidate !== "" && bcrypt.compare(candidate, hash);
}
