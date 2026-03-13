CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  service TEXT NOT NULL,
  owner TEXT NOT NULL,
  scope_tier TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  allowed_domains TEXT[] NOT NULL,
  permitted_operations TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ NULL,
  rotation_policy TEXT NOT NULL,
  last_validated_at TIMESTAMPTZ NULL,
  selection_notes TEXT NOT NULL,
  binding JSONB NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id TEXT PRIMARY KEY,
  effect TEXT NOT NULL,
  description TEXT NOT NULL,
  principals TEXT[] NOT NULL,
  credential_ids TEXT[] NULL,
  services TEXT[] NULL,
  operations TEXT[] NOT NULL,
  domain_patterns TEXT[] NOT NULL,
  environments TEXT[] NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  event_id UUID PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  principal TEXT NOT NULL,
  correlation_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_credentials_service ON credentials(service);
CREATE INDEX IF NOT EXISTS idx_credentials_owner ON credentials(owner);
CREATE INDEX IF NOT EXISTS idx_credentials_status ON credentials(status);
CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events(occurred_at DESC);
