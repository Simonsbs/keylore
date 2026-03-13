# Configuration

## Environment variables

- `KEYLORE_DATABASE_URL`: PostgreSQL connection string
- `KEYLORE_DATABASE_POOL_MAX`: max PostgreSQL pool size
- `KEYLORE_DATA_DIR`: base directory for catalogue, policy, and audit files
- `KEYLORE_CATALOG_FILE`: catalogue filename inside the data dir
- `KEYLORE_POLICY_FILE`: policy filename inside the data dir
- `KEYLORE_BOOTSTRAP_FROM_FILES`: import seed data from `data/` if the database is empty
- `KEYLORE_HTTP_HOST`: HTTP bind host
- `KEYLORE_HTTP_PORT`: HTTP bind port
- `KEYLORE_ENVIRONMENT`: logical environment used in policy evaluation
- `KEYLORE_DEFAULT_PRINCIPAL`: fallback principal when no request header is set
- `KEYLORE_MCP_BEARER_TOKEN`: optional bearer token required for remote MCP HTTP access
- `KEYLORE_LOG_LEVEL`: pino log level
- `KEYLORE_MAX_REQUEST_BYTES`: HTTP request body limit
- `KEYLORE_OUTBOUND_TIMEOUT_MS`: outbound proxy timeout
- `KEYLORE_MAX_RESPONSE_BYTES`: outbound response capture limit
- `KEYLORE_RATE_LIMIT_WINDOW_MS`: in-memory rate limit window
- `KEYLORE_RATE_LIMIT_MAX_REQUESTS`: in-memory max requests per client address per window

## Secret bindings

The default adapter is `env`. A credential binding such as:

```json
{
  "adapter": "env",
  "ref": "KEYLORE_SECRET_GITHUB_READONLY",
  "authType": "bearer",
  "headerName": "Authorization",
  "headerPrefix": "Bearer "
}
```

means:

- KeyLore reads the secret from the process environment variable `KEYLORE_SECRET_GITHUB_READONLY`
- the catalogue stores only the reference, not the secret value
- the broker injects the resulting header into the outbound proxy call

## Persistence model

The database is the system of record. `data/catalog.json` and `data/policies.json` are bootstrap seed inputs only.

## Request principal override

REST callers can set `X-KeyLore-Principal` to evaluate policy for a different principal. If omitted, KeyLore uses `KEYLORE_DEFAULT_PRINCIPAL`.
