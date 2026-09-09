# SwipeRight — Credit Card Cash Back Optimizer

## Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS 4 + Vite 6 (`frontend/`)
- **Backend**: Encore.dev (TypeScript) — API framework that manages its own PostgreSQL via Docker (`backend/`)
- **Auth**: JWT-based, token stored in localStorage (not cookies)
- **Package manager**: Bun (workspaces: `backend`, `frontend`)

## How it runs in this environment
- `docker-compose.base44.yml` brings up two services:
  - **backend** (built from `Dockerfile.backend`): Node 22 + Bun + Encore CLI + Docker CLI. Uses `network_mode: host` so Encore can provision PostgreSQL containers via the mounted Docker socket and reach them on localhost. Listens on port 4000.
  - **frontend** (node:22-slim): Vite dev server on port 5173 → mapped to host port 3000. Proxies `/auth`, `/cards`, `/ai` to the backend at `http://host.docker.internal:4000` (single-origin, no CORS needed).
- `VITE_CLIENT_TARGET` is set to empty in `frontend/.env.development` so the Encore client makes same-origin (relative) requests that Vite proxies to the backend.

## Secrets (Encore secrets, not plain env vars)
The backend uses Encore's `secret()` for three external-service keys:
- `OpenAIApiKey` — AI chat (OpenAI)
- `GeminiApiKey` — AI assistant (Google Gemini)
- `RewardsCCApiKey` — external card data (RewardsCC)

These are **optional** — the app boots without them. Only the AI/external-fetch features need them.
The platform delivers them as env vars in `/run/base44/app.env`; `.base44/start-backend.sh` bridges them into Encore's local secret store on each boot.

## Verifying it works
1. `docker compose -f docker-compose.base44.yml up -d --build`
2. Check `docker compose -f docker-compose.base44.yml ps` — both services should be up.
3. `curl -s http://localhost:3000` should return the Vite-served HTML.
4. The Encore backend logs show PostgreSQL provisioning and API startup on port 4000.
5. In the preview, the Home page renders; Cards/Recommendations/AIChat call the backend API.

## Key changes made for this environment
- `backend/encore.app`: Removed the `id` field so Encore runs in local-only mode without requiring `encore auth login` (cloud sync). Re-add the `id` to deploy to Encore Cloud.
- `.base44/start-backend.sh`: Runs `encore run --listen=0.0.0.0:4000 --browser=never` so the backend accepts connections from the frontend container's Docker bridge.
- `frontend/vite.config.ts`: Added `server.proxy` for `/auth`, `/cards`, `/ai` → backend, plus `allowedHosts: true` for the preview origin.
- `frontend/.env.development`: Set `VITE_CLIENT_TARGET=` (empty) so the Encore client makes same-origin requests proxied by Vite.

## Notes
- Encore provisions two PostgreSQL databases (`auth`, `cards`) as Docker containers on the host daemon. They persist in Docker volumes across restarts.
- The backend uses `network_mode: host`, so `ports:` is ignored — it listens directly on host port 4000.
- The frontend container reaches the backend via `host.docker.internal` (mapped to the host gateway).
- Three Encore secrets (`OpenAIApiKey`, `GeminiApiKey`, `RewardsCCApiKey`) are optional — the app boots without them. Only AI chat, AI assistant, and external card fetch features need them.
