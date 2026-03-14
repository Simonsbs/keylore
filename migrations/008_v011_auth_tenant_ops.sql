CREATE TABLE IF NOT EXISTS tenants (
  tenant_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (tenant_id, display_name, description, status)
VALUES ('default', 'Default Tenant', 'Bootstrap default tenant', 'active')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenants (tenant_id, display_name, description, status)
SELECT tenant_id, tenant_id, NULL, 'active'
FROM (
  SELECT tenant_id FROM credentials
  UNION
  SELECT tenant_id FROM policy_rules
  UNION
  SELECT tenant_id FROM audit_events
  UNION
  SELECT tenant_id FROM oauth_clients
  UNION
  SELECT tenant_id FROM access_tokens
  UNION
  SELECT tenant_id FROM approval_requests
  UNION
  SELECT tenant_id FROM break_glass_requests
  UNION
  SELECT tenant_id FROM rotation_runs
) tenant_ids
WHERE tenant_id IS NOT NULL
ON CONFLICT (tenant_id) DO NOTHING;

ALTER TABLE oauth_clients
  ALTER COLUMN secret_hash DROP NOT NULL;

ALTER TABLE oauth_clients
  ALTER COLUMN secret_salt DROP NOT NULL;

ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS grant_types TEXT[] NOT NULL DEFAULT ARRAY['client_credentials']::TEXT[];

ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS redirect_uris TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_id UUID PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  roles TEXT[] NOT NULL,
  resource TEXT NULL,
  redirect_uri TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_client_id
  ON oauth_authorization_codes(client_id, status);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_expires_at
  ON oauth_authorization_codes(expires_at);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  refresh_token_id UUID PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  scopes TEXT[] NOT NULL,
  roles TEXT[] NOT NULL,
  resource TEXT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NULL,
  replaced_by_token_id UUID NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_client_id
  ON refresh_tokens(client_id, status);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_tenant_id
  ON refresh_tokens(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at
  ON refresh_tokens(expires_at);
