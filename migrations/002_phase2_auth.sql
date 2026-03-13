ALTER TABLE policy_rules
  ADD COLUMN IF NOT EXISTS principal_roles TEXT[] NULL;

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  secret_salt TEXT NOT NULL,
  roles TEXT[] NOT NULL,
  allowed_scopes TEXT[] NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_tokens (
  token_id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  roles TEXT[] NOT NULL,
  resource TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_expires_at ON access_tokens(expires_at);

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_roles TEXT[] NOT NULL,
  credential_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  target_url TEXT NOT NULL,
  target_host TEXT NOT NULL,
  reason TEXT NOT NULL,
  rule_id TEXT NULL,
  correlation_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_fingerprint ON approval_requests(fingerprint);
