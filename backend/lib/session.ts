import { APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";

/**
 * The signed-in user's id, as proven by the auth handler. Endpoints use this
 * instead of any user id in the request, so nobody can read or write another
 * person's cards, offers or credits by changing a parameter.
 *
 * A paired browser extension authenticates too, but may only call endpoints
 * that pass `allowExtension` (portal sync and the card list it needs).
 */
export function currentUserId(opts: { allowExtension?: boolean } = {}): string {
  const data = getAuthData();
  if (!data) throw APIError.unauthenticated("Sign in to continue");
  if (data.kind === "extension" && !opts.allowExtension) {
    throw APIError.permissionDenied("The browser extension can only sync portal pages");
  }
  return data.userID;
}
