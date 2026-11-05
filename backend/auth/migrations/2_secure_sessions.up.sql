-- Signed sessions, revocation, hashed one-time secrets and login throttling.

-- Bumping session_version signs a user out of every device at once
-- (password reset, "sign out everywhere", account deletion).
ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 1;

-- Reset links were stored in plaintext. Keep only a SHA-256 hash from now on.
-- Any link issued under the old scheme is void.
DELETE FROM password_reset_tokens;
ALTER TABLE password_reset_tokens RENAME COLUMN token TO token_hash;

-- Browser extension credentials. The extension holds the raw token, the
-- database only its hash, and a token can only sync portal pages.
CREATE TABLE api_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

-- One-time codes the app shows and the extension exchanges for a token.
CREATE TABLE pairing_codes (
  code_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- Fixed-window attempt counters for login, signup, reset and pairing.
-- Buckets are hashed so the table holds no emails or IPs.
CREATE TABLE auth_throttle (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL
);
