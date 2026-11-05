/**
 * The one place the session token lives in the browser.
 *
 * The backend proves who is calling from this token (an HS256-signed JWT
 * checked on every request), so no request carries a user id of its own.
 * It sits in localStorage because the API is called cross-origin in
 * development and by the browser extension; the CSP in index.html is what
 * keeps scripts that could read it off the page.
 */

const KEY = 'auth_token';
const ENDED = 'swiperight:session-ended';

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* private mode: the session lasts for this tab only */
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
}

export function authHeaders(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Any call answered 401 means the token was revoked or expired: sign out everywhere in the UI. */
export function notifySessionEnded(): void {
  if (!getSessionToken()) return;
  clearSessionToken();
  window.dispatchEvent(new Event(ENDED));
}

export function onSessionEnded(handler: () => void): () => void {
  window.addEventListener(ENDED, handler);
  return () => window.removeEventListener(ENDED, handler);
}
