CREATE TABLE IF NOT EXISTS break_glass_requests (
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
  justification TEXT NOT NULL,
  requested_duration_seconds INTEGER NOT NULL,
  correlation_id UUID NOT NULL,
  fingerprint TEXT NOT NULL,
  reviewed_by TEXT NULL,
  reviewed_at TIMESTAMPTZ NULL,
  review_note TEXT NULL,
  revoked_by TEXT NULL,
  revoked_at TIMESTAMPTZ NULL,
  revoke_note TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_break_glass_requests_status
  ON break_glass_requests(status);

CREATE INDEX IF NOT EXISTS idx_break_glass_requests_fingerprint
  ON break_glass_requests(fingerprint);
