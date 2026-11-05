import { api, APIError } from "encore.dev/api";
import { authDB } from "./db";
import { userDeleted } from "./events";
import { currentUserId } from "../lib/session";
import { throttle, throttleIp } from "./throttle";
import { verifyPassword } from "./user";

// Signs this account out on every device by voiding all issued session tokens.
export const logoutEverywhere = api(
  { expose: true, auth: true, method: "POST", path: "/auth/logout-all" },
  async (): Promise<{ message: string }> => {
    const userId = currentUserId();
    await authDB.exec`
      UPDATE users SET session_version = session_version + 1, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `;
    return { message: "Signed out on every device." };
  }
);

export interface DeleteAccountRequest {
  /** Required for email accounts, so a borrowed unlocked phone can't do it. */
  password?: string;
}

// Permanently deletes the account and everything stored for it: wallet,
// offers, credit usage, forwarding inbox, paired extensions.
export const deleteAccount = api<DeleteAccountRequest, { message: string }>(
  { expose: true, auth: true, method: "POST", path: "/auth/account/delete", sensitive: true },
  async (req) => {
    const userId = currentUserId();
    await throttleIp("delete", 10, 60 * 60);
    await throttle(`delete:user:${userId}`, 5, 60 * 60);

    const user = await authDB.queryRow`SELECT password_hash FROM users WHERE user_id = ${userId}::uuid`;
    if (!user) throw APIError.notFound("Account not found");
    if (user.password_hash && !(await verifyPassword(req.password, user.password_hash))) {
      throw APIError.permissionDenied("That password is not right");
    }

    // Announce first, then remove the login: if publishing fails the account
    // still exists and the person can try again; the reverse could orphan data.
    await userDeleted.publish({ userId });
    await authDB.exec`DELETE FROM users WHERE user_id = ${userId}::uuid`;
    return { message: "Your account and its data are deleted." };
  }
);
