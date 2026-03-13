CREATE TABLE IF NOT EXISTS request_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_window_started_at
  ON request_rate_limits(window_started_at);
