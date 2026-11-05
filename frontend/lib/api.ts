/**
 * Where the backend lives. In production the app is served by the backend
 * itself, so it is the page's own origin. In development the Vite server runs
 * on :5173 and the API on :4000. VITE_CLIENT_TARGET overrides both.
 */
const configured = (import.meta.env.VITE_CLIENT_TARGET as string | undefined)?.trim();

export const API_BASE: string =
  configured || (import.meta.env.DEV ? 'http://localhost:4000' : window.location.origin);
