# SwipeRight: handoff

Read this first in a new session. It is the full state of the work as of 2026-09-14.

## The product

**SwipeRight** tells you which card in your wallet to use at the counter, for the most cash back.
Slogan: **"Max out your cash back, not your card limit."** The name is swiping right on the right card.

It accounts for category rates, spend caps, quarterly and user-chosen categories, merchant
offers, and credits that expire if unused ("more cash back on Reflect, but your Chase travel
credit dies in 12 days"). It must stay simple; CardPointers, MaxRewards and Kudos are the
over-complicated competitors it is positioned against.

## Where the code is

- Repo: `github.com/hanwar3/Swipe-Right-Original-App` (**public**). Local: `C:\Haider Files\Github Projects\Swipe-Right-Original-App`.
- All work is on branch **`feat/decision-engine`**, pushed, **not merged to `main`, not deployed**.
- `main` is written to by Leap (leap.new), which is why work happens on a branch.
- Stack: Encore.dev TypeScript backend (`backend/`: services `auth`, `cards`, `ai`, `offers`; Postgres) and Vite + React + Tailwind v4 frontend (`frontend/`).
- Run the frontend: `npm --prefix frontend run dev` (port 5173). Typecheck: `npm --prefix frontend run typecheck`, and `npx tsc --noEmit -p backend/tsconfig.json`.

## The three tabs (Haider corrected these once; do not drift)

| Tab | Route | Job |
|---|---|---|
| **Ask** | `/` | The deck of the user's cards. Tap flips a card out; tap again opens it in Insights; tap anywhere else puts it back. The orb (top-left, mic badge) is the voice button; beside it "What are you buying?" types out example questions. Typing field at the bottom. |
| **Wallet** | `/cards` | **Every** card, as data-carrying card faces. Where the portfolio is built (add/remove). "Add a card to the catalogue" form with RewardsCC lookup. |
| **Insights** | `/recommendations` | **Only** the user's portfolio: credits used vs. left, reset deadlines, expiring credits, merchant offers. Category filters come from the benefits those cards carry, never a fixed list. |

No category buttons on Ask: Haider described card *purposes*, he never asked for them as UI.

## Approved designs: keep exactly

- **"Swarm"** visual language: near-black ground, magenta `#E64BD4` accent, particle orb (`frontend/components/SwarmOrb.tsx`).
- **Template deck** shown with no cards / signed out: four plain placeholder cards in dark purple-to-black gradients with "Add your cards" (`TEMPLATE` in `frontend/pages/Counter.tsx`). Haider called it "SUPERB". Do not recolour or brand it.
- Card faces carry data (category multipliers, fee, best rate): `frontend/components/CardFace.tsx`.
- Deck: slabs in perspective with a wave on hover, flip-out on tap: `frontend/components/CardStack.tsx`.
- Voice: tapping the orb grows it into a full-screen listening view that swells with the mic level: `frontend/components/VoiceSheet.tsx`, `frontend/lib/voice.ts`.

## Architecture decisions

- **The engine decides, the LLM only phrases.** `backend/cards/decide.ts` ranks deterministically and returns a correct `spoken` sentence; `backend/ai/chat.ts` gives Gemini the finished decision and forbids changing any card, rate or figure. This replaced three disconnected recommendation paths.
- **One source for cards and portfolio:** `frontend/lib/wallet.ts` (`useCatalogue`, `useWallet`). Modes: `account` (server portfolio), `device` (server unreachable: wallet kept in localStorage so the app works at a register with no signal), `signed-out` (browse only).
- **Offline answers:** `frontend/lib/localDecide.ts` ranks device-wallet cards on headline rates and says so.
- **Benefits and usage:** `frontend/lib/benefits.ts`. Shipped benefit sets per card family, matched by card name. Usage, custom credits and hidden credits persist in localStorage (`swiperight_logged_credit_savings`, `swiperight_logged_subscription_savings`, `swiperight_logged_merchant_redeemed`, `swiperight_logged_merchant_savings`, `swiperight_custom_benefits`, `swiperight_hidden_benefits`, `swiperight_device_wallet`). Supports dollars or counted uses; monthly, quarterly, semi-annual, yearly, anniversary, every 4 years.
- **Offline card catalogue:** `frontend/lib/seedCatalogue.ts`, 16 cards, headline rates only, used when the API cannot be reached.
- **Merchant offers by forwarded email ("Tier 2")**: no aggregator sells targeted issuer offers. User forwards issuer offer emails to `offers+<token>@<domain>`. `backend/offers/ingest.ts` (webhook, shared secret), `parsers.ts` (regex for terms, Gemini fallback validated against source text), attribution cascade: per-card address, last four, registered mailbox header, card name, sole issuer card; unplaceable offers are held for one-tap assignment (`/offers/pending`, `/offers/attribute`). UI: `OfferInbox.tsx`, `OfferMatching.tsx`.
- Migrations added: `8_decision_engine` (category keys, caps, user category choices, card_benefits, usage), `9_offer_inbox` (inboxes, ingest log, attribution columns, dedupe index).

## Data sourcing strategy (agreed)

- Tier 0 public card catalogue (planned: Apify scrape of issuer pages, quarterly): covers "which card for gas" at ~$0.
- Tier 1 two taps a quarter (rotating category, rough spend).
- Tier 2 forwarded offer emails: built, needs a mail provider.
- Tier 3 aggregator (Plaid ~$1.50/user/month) for real spend and caps, behind a paid plan. Nobody contracts with issuers directly.

## Verified vs not

**Verified in the browser (375x812, offline/device mode):** template deck and prompt; tap-off and Escape deselect; orb growing into the voice view; blocked-microphone message; typed question flipping the right card; Wallet add/remove; Insights with 4 cards (categories ordered by money left, collapsing cards, custom counted credit, hiding a credit updating totals).

**Never executed:** the entire backend. Encore will not start on this PC (see blockers), so `decide`, `profile`, all `/offers/*`, and migrations 8 and 9 are only typechecked. Real speech recognition was not testable (the browser pane blocks the mic).

## SECURITY: critical, unfixed. Fix before any real user signs up.

Introduced on this branch:
1. **No authorization on new endpoints.** They take `userId` from the request: `cards/decide.ts:103`, `cards/profile.ts:13` (returns card last four + registered email, `:230-231`), `offers/inbox.ts:15,102,114` (forwarding address, rotate, card identity), `offers/ingest.ts:323,353` (pending, attribute), `ai/chat.ts:23`. Anyone can read or change any user's data, and learn a victim's forwarding address to inject fake offers.

Pre-existing (from before this work) and making the above trivial:
2. **Forgeable session tokens.** `auth/login.ts:64`, `auth/oauth.ts:90`, `auth/register.ts:94` build an unsigned base64 `{userId, exp}`; `auth/verify.ts:21` accepts it.
3. **`GET /auth/users` is public** (`auth/users.ts:12`), listing every user's id, email, name.
4. **OAuth never verifies the provider token** (`auth/oauth.ts:17`).
5. `cards/portfolio.ts` and `cards/merchant_offers.ts` have the same client-supplied `userId` pattern.

**Fix plan (do it as one coordinated change, or the app locks everyone out):** signed tokens (HMAC secret), an Encore `authHandler` + `Gateway`, `auth: true` on every user-data endpoint with `userId` from `getAuthData()` (reject mismatched path ids), frontend sends `Authorization: Bearer`, `/auth/users` set `expose: false`, OAuth disabled until real Google/Apple token verification is configured.

Also: a **GitHub personal access token is embedded in the local git remote URL** (`.git/config`). Rotate it and switch the remote to `https://github.com/hanwar3/Swipe-Right-Original-App.git` with `gh auth setup-git`.

## Blockers

- **Encore daemon on this PC:** `listen unix ...\encored.sock: bind: An invalid argument was supplied.` on Encore **1.57.5**. A stale socket file was removed; the bind still fails. The vendor fix is the **1.58.4** security update via their installer (Haider has to run it): `powershell -Command "iwr https://encore.dev/install.ps1 -useb | iex"`. Docker Desktop must be running.
- **Deploying:** the app is linked to Encore Cloud app `swiperight-credit-card-app-x4n2`. Secrets needed: `GeminiApiKey`, `RewardsCCApiKey`, `OfferInboxSecret`. Recommended path: deploy to a **private test environment** first (test data only). That is also the fastest way to run the backend at all.
- **Offers email:** needs a real inbound domain (`INBOX_DOMAIN` in `backend/offers/inbox.ts` is a placeholder) and a Mailgun/Postmark route to `POST /offers/ingest` with header `X-Inbox-Secret`.
- **21st.dev MCP:** not connected; needs `API_KEY_21ST` set in an interactive terminal.

## Next steps, in order

1. Get the backend running (Encore upgrade locally, or a private Encore Cloud test deploy) and fix whatever the real database exposes.
2. Security fix plan above.
3. Merge `feat/decision-engine` to `main`, deploy to test, then production.
4. Mail provider + domain for offers; tune parsers against real issuer emails.
5. Public catalogue scrape (Apify) for "every card on the market".
6. ElevenLabs voice needs a server-side proxy so the key never reaches the browser.

## Data caveats

Some shipped benefit amounts predate issuer changes (e.g. Chase Sapphire Reserve's 2025 relaunch changed its credits). They are Haider's original dataset and were kept; users can hide or add credits in Insights.
