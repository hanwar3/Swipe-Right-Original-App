# SwipeRight: handoff

Read this first in a new session. It is the state of the work as of 2026-11-06.

## Latest: branch `feat/launch` (2026-11-05/06)

Built on `feat/portal-sync` (which is on `feat/decision-engine`). Pushed, not merged, not deployed.
Deploy steps and the security model: **`docs/DEPLOY.md`**.

- **Security, fixed** (`3bf7e41`): HS256-signed sessions with revocation, an Encore auth handler,
  every user-data endpoint `auth: true` with the user taken from the token, Postgres-backed
  throttling, hashed single-use reset links, OAuth switched off until provider tokens are verified,
  user list removed, account deletion via a `user-deleted` Pub/Sub event, sign out everywhere,
  production CSP. The web app is served from the site root, so the Wallet tab moved to `/wallet`
  (`GET /cards` is the catalogue API on the same origin).
- **Credits that change** (`77fa57d`): one server catalogue (`card_benefits` with slugs, versions,
  change notes), kept current by editorial updates (`cards.updateCatalogue`, internal), each
  cardholder's own portal (personal override, at once) and crowd consensus (3+ portals agreeing,
  `benefit_crowd.ts`). Manual usage works as before but is stored per period on the server.
  DoorDash on Sapphire Reserve seeded at $15/month with "was $5" (Haider's figure).
  Merchant-only credits now steer only at their merchant (`merchants` column).
- **Offer capture** (`886c594`): `extension/` (Manifest V3; pairing code from Account & security;
  "Add all offers" and "Sync"; Safari via Apple's converter), `POST /portal/sync` (places a page
  on the right card, asks once), `POST /portal/screenshot` (Gemini transcribes, the same parsers
  read; never retires), `GET /offers/hints` (merchants 5+ other cardholders have; k-anonymous).
- **Wallet questions** (`backend/cards/questions.ts`): "which offers expire this week?",
  "any offers at Nike?", "what credits do I have left?" answered from the data, in the decision's
  shape, so typing, voice and the deck work unchanged; every answer says when an offer still has
  to be added.
- Tests: `scripts/smoke-backend.mjs` 83 checks, `scripts/smoke-portal.mjs` 26 (incl. a live Gemini
  screenshot read and the crowd thresholds). Fresh production build in `backend/frontend/dist`.


## The product

**SwipeRight** tells you which card in your wallet to use at the counter, for the most cash back.
Slogan: **"Max out your cash back, not your card limit."** The name is swiping right on the right card.

It accounts for category rates, spend caps, quarterly and user-chosen categories, merchant
offers, and credits that expire if unused ("more cash back on Reflect, but your Chase travel
credit dies in 12 days"). It must stay simple; CardPointers, MaxRewards and Kudos are the
over-complicated competitors it is positioned against.

## Where the code is

- Repo: `github.com/hanwar3/Swipe-Right-Original-App` (**public**). Local: `C:\Haider Files\Github Projects\Swipe-Right-Original-App`.
- Latest work is on branch **`feat/launch`**, pushed, **not merged to `main`, not deployed**.
- `main` is written to by Leap (leap.new), which is why work happens on a branch.
- Stack: Encore.dev TypeScript backend (`backend/`: services `auth`, `cards`, `ai`, `offers`; Postgres) and Vite + React + Tailwind v4 frontend (`frontend/`).
- Run the frontend: `npm --prefix frontend run dev` (port 5173). Typecheck: `npm --prefix frontend run typecheck`, and `npx tsc --noEmit -p backend/tsconfig.json` (currently 2 errors, both inside `node_modules/encore.dev/api/node_http.ts`: encore.dev 1.58.5 clashes with `@types/node` 26; none in our code).
- Run the backend: `scripts\run-backend.cmd` from **your own terminal** (API on port 4000, dev dashboard on 9400). First time: `encore auth login`. See "Running the backend on this PC".
- Smoke test the running backend: `node scripts/smoke-backend.mjs` (83 checks) and `node scripts/smoke-portal.mjs` (26 checks).

## The three tabs (Haider corrected these once; do not drift)

| Tab | Route | Job |
|---|---|---|
| **Ask** | `/` | The deck of the user's cards. Tap flips a card out; tap again opens it in Insights; tap anywhere else puts it back. The orb (top-left, mic badge) is the voice button; beside it "What are you buying?" types out example questions. Typing field at the bottom. |
| **Wallet** | `/wallet` | **Every** card, as data-carrying card faces. Where the portfolio is built (add/remove). "Add a card to the catalogue" form (a new card starts at a flat 1%). |
| **Insights** | `/recommendations` | **Only** the user's portfolio: credits used vs. left, reset deadlines, expiring credits, merchant offers. Category filters come from the benefits those cards carry, never a fixed list. Each card also carries a "From your \<issuer\> portal" block (`components/PortalCard.tsx`): the offers targeted at that card, which of them still need adding in the portal, and each credit's real usage. |

No category buttons on Ask: Haider described card *purposes*, he never asked for them as UI.

## Approved designs: keep exactly

- **"Swarm"** visual language: near-black ground, magenta `#E64BD4` accent, particle orb (`frontend/components/SwarmOrb.tsx`).
- **Template deck** shown with no cards / signed out: four plain placeholder cards in dark purple-to-black gradients with "Add your cards" (`TEMPLATE` in `frontend/pages/Counter.tsx`). Haider called it "SUPERB". Do not recolour or brand it.
- Card faces carry data (category multipliers, fee, best rate): `frontend/components/CardFace.tsx`.
- Deck: slabs in perspective with a wave on hover, flip-out on tap: `frontend/components/CardStack.tsx`.
- Voice: tapping the orb grows it into a full-screen listening view that swells with the mic level: `frontend/components/VoiceSheet.tsx`, `frontend/lib/voice.ts`.

## Architecture decisions

- **The engine decides, the LLM only phrases.** `backend/cards/decide.ts` ranks deterministically and returns a correct `spoken` sentence; `backend/ai/chat.ts` gives Gemini the finished decision and forbids changing any card, rate or figure. This replaced three disconnected recommendation paths.
- **Gemini lives in one file:** `backend/lib/gemini.ts` names the model (`gemini-3.6-flash`) for both callers, voice phrasing (thinking `minimal`) and mail offer extraction (thinking `low`). The old `gemini-2.0-flash` was retired and every call had silently fallen back; failures and token-limit cut-offs are now logged and fall back to the engine's sentence. Newer Flash models think by default and burn `maxOutputTokens` on it, so keep the thinking level set.
- **One source for cards and portfolio:** `frontend/lib/wallet.ts` (`useCatalogue`, `useWallet`). Modes: `account` (server portfolio), `device` (server unreachable: wallet kept in localStorage so the app works at a register with no signal), `signed-out` (browse only).
- **Offline answers:** `frontend/lib/localDecide.ts` ranks device-wallet cards on headline rates and says so.
- **Benefits and usage:** `frontend/lib/benefits.ts` reads the server catalogue (`GET /benefits/catalogue`, cached locally) and, signed in, the account's usage, custom and hidden credits (`/benefits/*`, `backend/cards/benefits.ts`). The shipped sets below are the offline fallback only. Signed out, usage, custom credits and hidden credits persist in localStorage (`swiperight_logged_credit_savings`, `swiperight_logged_subscription_savings`, `swiperight_logged_merchant_redeemed`, `swiperight_logged_merchant_savings`, `swiperight_custom_benefits`, `swiperight_hidden_benefits`, `swiperight_device_wallet`). Supports dollars or counted uses; monthly, quarterly, semi-annual, yearly, anniversary, every 4 years.
- **Offline card catalogue:** `frontend/lib/seedCatalogue.ts`, 16 cards, headline rates only, used when the API cannot be reached.
- **Merchant offers by forwarded email ("Tier 2")**: no aggregator sells targeted issuer offers. User forwards issuer offer emails to `offers+<token>@<domain>`. `backend/offers/ingest.ts` (webhook, shared secret), `parsers.ts` (regex for terms, Gemini fallback validated against source text), attribution cascade: per-card address, last four, registered mailbox header, card name, sole issuer card; unplaceable offers are held for one-tap assignment (`/offers/pending`, `/offers/attribute`). UI: `OfferInbox.tsx`, `OfferMatching.tsx`.
- Migrations added: `8_decision_engine` (category keys, caps, user category choices, card_benefits, usage), `9_offer_inbox` (inboxes, ingest log, attribution columns, dedupe index).

## Data sourcing strategy (agreed)

- Tier 0 public card catalogue (planned: Apify scrape of issuer pages, quarterly): covers "which card for gas" at ~$0, including each quarter's rotating 5% categories.
- **RewardsCC removed (2026-09-17).** The integration called `api.rewardscc.com`, a domain that does not exist, so it never returned data. The real RewardsCC is a paid RapidAPI product (plans up to $499/month) that sells public card terms only: it does carry quarterly bonus dates, but no per-user benefit usage, targeted offers or activation state. Do not re-add it; Tier 0 covers the same public data.
- Tier 1 two taps a quarter (rotating category, rough spend).
- Tier 2 forwarded offer emails: built, needs a mail provider.
- **Tier 2b the portal, pasted (built 2026-09-23).** Targeted offers and credit usage exist only behind the cardholder's login, and no aggregator sells either. So the user copies the page they are already signed in to (Chase Offers, Amex Offers, or one benefit page) and pastes it into the card in Insights. `backend/offers/portal_parsers.ts` reads the rendered tiles deterministically, Gemini only sees text the regexes could not, and `POST /portal/paste` writes the same rows the extension will write later: offers with activation state and expiry, credits with used-of-total and the portal's own reset date. A full offers page is authoritative for that card, so offers it stopped showing are marked `disappeared_at` rather than deleted. A page whose account number disagrees with the open card is refused. No automation touches a bank.
- Tier 3 aggregator (Plaid ~$1.50/user/month) for real spend and caps, behind a paid plan. Nobody contracts with issuers directly.

## Verified vs not

**Verified in the browser (375x812, offline/device mode):** template deck and prompt; tap-off and Escape deselect; orb growing into the voice view; blocked-microphone message; typed question flipping the right card; Wallet add/remove; Insights with 4 cards (categories ordered by money left, collapsing cards, custom counted credit, hiding a credit updating totals).

**Verified against a real Postgres (2026-09-14, `scripts/smoke-backend.mjs`, 38 checks):** all nine cards migrations apply cleanly to empty databases; register; portfolio add and list; `decide` for gas, groceries, dining, flights, a named merchant and unlisted purchases; card profile; inbox address and per-card addresses; last four; ingest by last four, by per-card address, ambiguous mail held as pending, a re-forward de-duplicated, mail without offers logged as unparsed, a wrong secret rejected; pending plus one-tap attribution; the offers list; `ai/chat` falling back to the engine's sentence without a Gemini key.

**Bugs that first real run found, fixed in the same change:**
- `GET /offers/pending` and `GET /cards/merchant-offers/:userId` returned 500 as soon as an offer had an end date (DATE columns arrive as strings, not Date objects).
- The engine never read the `other` base rate that 69 card rows use, so Costco or any unlisted purchase got no card and the sentence "You don't have any cards in your portfolio yet".
- Expired rotating quarters still counted: Freedom Flex's 5% gas (ended 2024-12-31) beat Blue Cash Preferred's real 3%. `decide` and `profile` now skip categories whose `valid_until` has passed.
- Offers were matched against the normalised category ("dining") instead of what was said ("Starbucks"), so they never applied. They now add to the card's own rate (they are statement credits on top), respect the minimum spend, and are capped by "up to $X" (stored in `maximum_cashback`).
- The parser stored "Spend $50, get $10 back" as "Spend $50,, get $10 back".

**Verified 2026-09-23 (`scripts/smoke-portal.mjs`, 11 checks, branch `feat/portal-sync`):** a pasted Chase Offers page writes 17 offers with the right rates and flags; a pasted "$300 Annual Travel Credit" page stores $290 of $300 resetting 2027-06-15 and retires nothing; Insights lists the ones still needing activation first; a later, shorter sync retires the 16 offers the page dropped; a page for a different card is refused with nothing written. Parser bugs found and fixed on real text: "Blue Apron" was read as an April 15 expiry (a month prefix matcher), and one tile's "Added" flag leaked onto the tile above it.

**Verified 2026-09-17:** Gemini phrasing end to end (`ai/chat` returns `fallback=false` with the engine's card and rate), with `GeminiApiKey` in `backend/.secrets.local.cue`.

**Still not verified:** real speech recognition (the browser pane blocks the mic); the frontend against the live backend; model-based offer extraction inside `ingest` (the model call was tested directly, not through a real unparseable email); real issuer mail through a mail provider.

## Engine gaps seen while testing (not fixed)

- The spoken sentence does not say when the winning offer still has to be activated ("13% back" assumes you activate the Starbucks offer); only the reasons do.
- No card-network acceptance: Costco in-store takes only Visa, yet the engine can name an Amex or Mastercard there. Ties (four cards at 1%) are broken arbitrarily.
- A user-chosen category (e.g. Citi Custom Cash's top category) is not held to that card's cap.
- Credits are catalogued for Sapphire Preferred/Reserve, Amex Gold/Platinum, Blue Cash Preferred, Venture X, Savor and World of Hyatt; other cards rely on custom credits.
- Catalogue data is stale in places: rotating quarters from 2024, duplicate "Chase Sapphire Preferred" entries.

## Security

Fixed on `feat/launch`; the model is written up in `docs/DEPLOY.md`. Still open: a **GitHub personal
access token is embedded in the local git remote URL** (`.git/config`). Rotate it and switch the
remote to `https://github.com/hanwar3/Swipe-Right-Original-App.git` with `gh auth setup-git`.

## Running the backend on this PC

It runs (Encore CLI 1.58.5, Docker Desktop). Four things were in the way; `scripts\run-backend.cmd` handles the first two:

1. **Never start Encore from a Claude session.** The Claude desktop app is an MSIX package, and Windows redirects AppData writes of every process it launches into `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local`. Encore's daemon socket cannot work there, so the daemon dies with `bind: An invalid argument was supplied` or `CreateFile ...encored.sock: The file cannot be accessed by the system`. That was the real cause of the old "Encore will not start" blocker; the Encore version never mattered. A Claude session can open a separate Windows Terminal window (`wt.exe`), which runs outside the redirection, and then use the API over HTTP.
2. **x64 Node.** Encore's native runtime is x64 and this PC is ARM64. The script puts `.tools\node-x64` first on PATH and restarts the daemon so the app process inherits it.
3. **`encore auth login`, once.** The app is linked to Encore Cloud, and `encore run` will not start until it has fetched development secrets. Local overrides go in `backend\.secrets.local.cue` (gitignored), e.g. `OfferInboxSecret: "local-smoke-test-secret"` for the smoke test.
4. **An old local database.** The unlinked `default` namespace holds a database from May whose migration table says version 9 but whose `cards` table has no `type` column, so `/cards` fails there. A linked run gets fresh databases; otherwise use `--namespace smoke` or `encore db reset`.

From a Claude session: launch `.tools\run-smoke.cmd` in a Windows Terminal tab
(`wt.exe -w 0 new-tab --title SwipeRight-backend cmd /k "<path>"`; a space in `--title` breaks it).
It logs to `.tools\encore-run.log`. Hot reload picks up code but **not new migrations**: restart
the run after adding one. Unknown paths return the web app's `index.html` with 200 (the static
fallback), so a 200 is not proof an API route exists.

On first run Encore also bumped `encore.dev` to ^1.58.5 and regenerated `bun.lock`, which had drifted from package.json (bcryptjs 3, @types/node 26).

## Blockers

- **Deploying:** follow `docs/DEPLOY.md`. Needs `encore auth login` and three secrets in Encore Cloud:
  `SessionSecret`, `GeminiApiKey` (paid tier for privacy), `OfferInboxSecret`. Private test
  environment first.
- **Offers email:** needs a real inbound domain (`INBOX_DOMAIN` in `backend/offers/inbox.ts` is a placeholder) and a Postmark/Mailgun route to `POST /offers/ingest` with header `X-Inbox-Secret`.
- **Password reset** has no email provider; the UI link is hidden behind `VITE_PASSWORD_RESET=on`.

## Next steps, in order

1. Haider: rotate the GitHub token, `encore auth login`, set the three secrets, deploy to a private test environment, run the smoke suites against it (`API_URL=...`).
2. Set `DEFAULT_SERVER` in `extension/popup.js` to the deployed address; try the extension on real Chase and Amex pages and tune `addAllOffers` selectors if a portal's buttons differ.
3. Mail provider + domain for offer emails; tune parsers against real issuer mail.
4. Purchase answers: say "activate it first" in the spoken sentence, not only in the reasons; card-network acceptance (Costco is Visa-only); hold user-chosen categories to their caps.
5. Public catalogue scrape (Apify) for every card on the market, including rotating quarters.
6. Email provider for password reset; then real Google/Apple sign-in with verified ID tokens.

## Data caveats

Some shipped benefit amounts predate issuer changes (e.g. Chase Sapphire Reserve's 2025 relaunch changed its credits). They are Haider's original dataset and were kept; users can hide or add credits in Insights.
