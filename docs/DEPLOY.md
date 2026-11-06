# Deploying SwipeRight

The app is one Encore application: the API services (`auth`, `cards`, `offers`,
`ai`) and the web app, which the `frontend` service serves from the site root.
Encore Cloud provisions Postgres and Pub/Sub; there is nothing else to host.

## Before the first deploy

1. **Log in to Encore** (once per machine): `encore auth login`.
   The app is linked as `swiperight-credit-card-app-x4n2` in `backend/encore.app`.

2. **Set the secrets** for each environment (Encore Cloud dashboard → Settings →
   Secrets, or the CLI). The app will not start without them.

   ```bash
   encore secret set --type prod,dev SessionSecret
   ```

   ```bash
   encore secret set --type prod,dev GeminiApiKey
   ```

   ```bash
   encore secret set --type prod,dev OfferInboxSecret
   ```

   | Secret | What it is |
   |---|---|
   | `SessionSecret` | Signs session tokens. At least 32 random characters, e.g. the output of `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"`. Changing it signs everyone out. |
   | `GeminiApiKey` | Phrasing spoken answers, reading forwarded offer emails and phone screenshots. Use a **paid-tier** key in production: on the free tier Google may use requests to improve its models, and screenshots contain account details. |
   | `OfferInboxSecret` | Shared secret the inbound-mail provider sends as `X-Inbox-Secret` to `POST /offers/ingest`. Long and random; never the local test value. |

3. **Build the web app** into the backend, then commit the build:

   ```bash
   cd backend && bun run build
   ```

   This writes `backend/frontend/dist`. Leave `VITE_CLIENT_TARGET` unset: the
   built app then calls the API on its own origin. The production build carries
   a Content-Security-Policy that only allows scripts from the app itself.

4. **Restore the app id** if you ran the backend unlinked locally:
   `backend/encore.app` must say `"id": "swiperight-credit-card-app-x4n2"`.
   Never commit `backend/.secrets.local.cue`.

## Deploy

Push to Encore's remote (`git push encore`) or connect the GitHub repo in the
Encore dashboard and push the branch it deploys. Migrations run on startup.

After it is up, run the smoke suites against it:

```bash
API_URL=https://<env>-swiperight-credit-card-app-x4n2.encr.app node scripts/smoke-backend.mjs
```

The suite registers throwaway users and deletes them at the end. The inbox
checks need `OFFER_INBOX_SECRET` set to the environment's value in the shell.

## After the first deploy

- **Offer emails.** `INBOX_DOMAIN` in `backend/offers/inbox.ts` is a placeholder
  (`offers.swiperight.app`). Point a real domain's MX records at an inbound-mail
  provider (Postmark, Mailgun or Cloudflare Email Routing to a Worker), route
  `offers+*@<domain>` to `POST /offers/ingest`, and send `X-Inbox-Secret`.
- **Browser extension.** Set `DEFAULT_SERVER` in `extension/popup.js` to the
  deployed address, then publish (see `extension/README.md`; Safari via Apple's
  converter). Addresses on `*.encr.app` work without extra permission prompts.
- **Password reset** needs an email provider. The endpoints are ready (hashed,
  single-use, 30-minute links that sign the account out everywhere); wire
  `sendResetEmail` in `backend/auth/reset_password.ts` to the provider, then
  build the web app with `VITE_PASSWORD_RESET=on` to show "Forgot password?".
- **Social sign-in** is off on purpose. Turn it on only with server-side
  verification of Google's or Apple's ID token (see `backend/auth/oauth.ts`).
- **Updating a credit for everyone** (an issuer changes a benefit): call the
  internal `cards.updateCatalogue` endpoint from the Encore dashboard's API
  explorer with `slug`, the new `valueCents` or `period`, and a `note` that
  cardholders will see, e.g. `"Now $15 a month (was $5)."`. Crowd updates
  happen on their own once 3 cardholders' portals agree.

## Security model, in one place

- Sessions: HS256-signed tokens (7 days, refreshed daily while in use),
  revocable per account (`session_version`): sign out everywhere, password
  reset and account deletion all void old tokens.
- Every user-data endpoint is `auth: true` and takes the user from the token,
  never from the request. The browser extension has its own hashed token that
  can only sync portal pages and read the card list.
- Login, signup, reset, pairing and deletion are throttled in Postgres (per
  account always, per IP in the cloud). Passwords: bcrypt cost 12, NIST-style
  rules, 72-byte cap. Unknown accounts take as long to reject as wrong passwords.
- Passwords, bank page text and screenshots are marked `sensitive`, so Encore's
  traces do not store them.
- Account deletion publishes `user-deleted`; the cards service erases the
  account's rows, including its anonymous portal observations.
- CORS only matters in development (the web app is same-origin in production);
  `backend/encore.app` allows the Vite dev server.
