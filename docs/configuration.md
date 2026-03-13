# Configuration

## Environment variables

- `KEYLORE_DATABASE_URL`: PostgreSQL connection string
- `KEYLORE_DATABASE_POOL_MAX`: max PostgreSQL pool size
- `KEYLORE_DATA_DIR`: base directory for catalogue, policy, and audit files
- `KEYLORE_CATALOG_FILE`: catalogue filename inside the data dir
- `KEYLORE_POLICY_FILE`: policy filename inside the data dir
- `KEYLORE_AUTH_CLIENTS_FILE`: OAuth client bootstrap filename inside the data dir
- `KEYLORE_BOOTSTRAP_FROM_FILES`: import seed data from `data/` if the database is empty
- `KEYLORE_HTTP_HOST`: HTTP bind host
- `KEYLORE_HTTP_PORT`: HTTP bind port
- `KEYLORE_PUBLIC_BASE_URL`: external base URL used in OAuth metadata and resource binding
- `KEYLORE_OAUTH_ISSUER_URL`: issuer URL reported from the token metadata endpoint
- `KEYLORE_ENVIRONMENT`: logical environment used in policy evaluation
- `KEYLORE_DEFAULT_PRINCIPAL`: fallback principal when no request header is set
- `KEYLORE_LOG_LEVEL`: pino log level
- `KEYLORE_MAX_REQUEST_BYTES`: HTTP request body limit
- `KEYLORE_OUTBOUND_TIMEOUT_MS`: outbound proxy timeout
- `KEYLORE_MAX_RESPONSE_BYTES`: outbound response capture limit
- `KEYLORE_RATE_LIMIT_WINDOW_MS`: in-memory rate limit window
- `KEYLORE_RATE_LIMIT_MAX_REQUESTS`: in-memory max requests per client address per window
- `KEYLORE_ACCESS_TOKEN_TTL_SECONDS`: issued bearer token lifetime
- `KEYLORE_APPROVAL_TTL_SECONDS`: pending approval lifetime
- `KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET`: seed secret for `keylore-admin-local`
- `KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET`: seed secret for `keylore-consumer-local`

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

## OAuth and remote access

KeyLore exposes:

- `GET /.well-known/oauth-authorization-server`
- `GET /.well-known/oauth-protected-resource/api`
- `GET /.well-known/oauth-protected-resource/mcp`
- `POST /oauth/token`

Remote callers use the `client_credentials` grant. Tokens may be resource-bound:

- use `resource=<publicBaseUrl>/v1` for REST API access
- use `resource=<publicBaseUrl>/mcp` for remote MCP access

If a token is resource-bound, KeyLore rejects it on the wrong protected resource.

## Roles and scopes

Built-in roles are:

- `admin`
- `operator`
- `auditor`
- `approver`
- `consumer`

Built-in scopes are:

- `catalog:read`
- `catalog:write`
- `admin:read`
- `admin:write`
- `broker:use`
- `audit:read`
- `approval:read`
- `approval:review`
- `mcp:use`

Scopes gate endpoint families. Roles add separation of duties for sensitive actions such as approval review, audit reads, and auth-client inspection.

## Persistence model

The database is the system of record. `data/catalog.json`, `data/policies.json`, and `data/auth-clients.json` are bootstrap seed inputs only.

## Bootstrap behavior

If bootstrap is enabled and the database is empty, KeyLore imports catalogue records, policies, and auth clients from `data/`.

Auth client bootstrap is strict: missing `secretRef` environment variables fail startup instead of silently creating an unusable remote-auth setup.

## Local operator context

The local CLI uses `KEYLORE_DEFAULT_PRINCIPAL` and a built-in operator context with all current scopes plus `admin`, `operator`, `auditor`, and `approver` roles. Remote HTTP and MCP requests always use issued bearer tokens instead.
