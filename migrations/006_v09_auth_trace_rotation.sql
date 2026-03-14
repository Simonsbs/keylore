ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_basic';

ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS jwks JSONB NULL;

ALTER TABLE oauth_clients
  ALTER COLUMN secret_hash DROP NOT NULL;

ALTER TABLE oauth_clients
  ALTER COLUMN secret_salt DROP NOT NULL;

CREATE TABLE IF NOT EXISTS oauth_client_assertion_jtis (
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  jti TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_id, jti)
);

CREATE INDEX IF NOT EXISTS idx_oauth_client_assertion_jtis_expires_at
  ON oauth_client_assertion_jtis(expires_at);

CREATE TABLE IF NOT EXISTS rotation_runs (
  id UUID PRIMARY KEY,
  credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  due_at TIMESTAMPTZ NULL,
  planned_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  planned_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  note TEXT NULL,
  target_ref TEXT NULL,
  result_note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rotation_runs_status_due_at
  ON rotation_runs(status, due_at);

CREATE INDEX IF NOT EXISTS idx_rotation_runs_credential_id
  ON rotation_runs(credential_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rotation_runs_open_by_credential
  ON rotation_runs(credential_id)
  WHERE status IN ('pending', 'in_progress');
