#!/bin/sh
cd /app/backend
bun install

# Bridge: Encore manages its own secret store, but the platform delivers
# credentials as env vars via /run/base44/app.env.  Set them into Encore's
# local secret store so the app can use them.
for name in OpenAIApiKey GeminiApiKey RewardsCCApiKey; do
  eval "val=\$$name"
  if [ -n "$val" ]; then
    printf '%s' "$val" | encore secret set --type local "$name" 2>/dev/null || true
  fi
done

exec encore run
