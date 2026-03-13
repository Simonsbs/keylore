# Configuration

## Environment variables

- `KEYLORE_DATA_DIR`: base directory for catalogue, policy, and audit files
- `KEYLORE_CATALOG_FILE`: catalogue filename inside the data dir
- `KEYLORE_POLICY_FILE`: policy filename inside the data dir
- `KEYLORE_AUDIT_FILE`: audit filename inside the data dir
- `KEYLORE_HTTP_HOST`: HTTP bind host
- `KEYLORE_HTTP_PORT`: HTTP bind port
- `KEYLORE_ENVIRONMENT`: logical environment used in policy evaluation
- `KEYLORE_DEFAULT_PRINCIPAL`: fallback principal when no request header is set
- `KEYLORE_MCP_BEARER_TOKEN`: optional bearer token required for remote MCP HTTP access
- `KEYLORE_LOG_LEVEL`: pino log level

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

## Request principal override

REST callers can set `X-KeyLore-Principal` to evaluate policy for a different principal. If omitted, KeyLore uses `KEYLORE_DEFAULT_PRINCIPAL`.
