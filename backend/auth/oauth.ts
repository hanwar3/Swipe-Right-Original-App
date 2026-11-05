import { api, APIError } from "encore.dev/api";
import type { RegisterResponse } from "./register";

export interface OAuthRequest {
  provider: "google" | "apple";
  accessToken: string;
  email: string;
  providerId: string;
  firstName?: string;
  lastName?: string;
  profilePictureUrl?: string;
}

// Social sign-in is switched off. The old version trusted the email and
// provider id the browser sent without checking them with Google or Apple,
// so anyone could sign in as anyone. Turn it back on only with server-side
// verification of the provider's ID token (Google: tokeninfo or JWKS,
// Apple: its JWKS), matching `aud` to this app's client id.
export const oauth = api<OAuthRequest, RegisterResponse>(
  { expose: true, method: "POST", path: "/auth/oauth", sensitive: true },
  async () => {
    throw APIError.unimplemented("Google and Apple sign-in are not available yet. Use email and password.");
  }
);
