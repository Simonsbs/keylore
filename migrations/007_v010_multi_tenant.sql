ALTER TABLE credentials
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE policy_rules
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE oauth_clients
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE access_tokens
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE break_glass_requests
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

ALTER TABLE rotation_runs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_credentials_tenant_id ON credentials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_policy_rules_tenant_id ON policy_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_id_occurred_at ON audit_events(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_oauth_clients_tenant_id ON oauth_clients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_tokens_tenant_id ON access_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_id_status ON approval_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_break_glass_requests_tenant_id_status ON break_glass_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_rotation_runs_tenant_id_status ON rotation_runs(tenant_id, status);
