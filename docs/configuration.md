# Configuration

## Environment variables

- `KEYLORE_DATABASE_URL`: PostgreSQL connection string
- `KEYLORE_DATABASE_POOL_MAX`: max PostgreSQL pool size
- `KEYLORE_DATA_DIR`: base directory for catalogue, policy, and auth-client seed files
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
- `KEYLORE_RATE_LIMIT_WINDOW_MS`: shared PostgreSQL-backed rate limit window
- `KEYLORE_RATE_LIMIT_MAX_REQUESTS`: max requests per client address per window
- `KEYLORE_MAINTENANCE_ENABLED`: enable periodic maintenance
- `KEYLORE_MAINTENANCE_INTERVAL_MS`: maintenance interval
- `KEYLORE_ACCESS_TOKEN_TTL_SECONDS`: issued bearer token lifetime
- `KEYLORE_APPROVAL_TTL_SECONDS`: pending approval lifetime
- `KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET`: seed secret for `keylore-admin-local`
- `KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET`: seed secret for `keylore-consumer-local`
- `KEYLORE_VAULT_ADDR`: Vault base URL for the Vault adapter
- `KEYLORE_VAULT_TOKEN`: Vault token for secret reads and metadata inspection
- `KEYLORE_VAULT_NAMESPACE`: optional Vault namespace
- `KEYLORE_OP_BIN`: 1Password CLI binary path or name
- `KEYLORE_AWS_BIN`: AWS CLI binary path or name
- `KEYLORE_GCLOUD_BIN`: gcloud CLI binary path or name
- `KEYLORE_SANDBOX_INJECTION_ENABLED`: enables sandbox injection mode
- `KEYLORE_SANDBOX_COMMAND_ALLOWLIST`: comma-separated executable allowlist for sandbox mode
- `KEYLORE_SANDBOX_DEFAULT_TIMEOUT_MS`: default sandbox runtime timeout
- `KEYLORE_SANDBOX_MAX_OUTPUT_BYTES`: max captured sandbox output after redaction
- `KEYLORE_ADAPTER_MAX_ATTEMPTS`: adapter retry attempts for transient failures
- `KEYLORE_ADAPTER_RETRY_DELAY_MS`: adapter retry backoff base
- `KEYLORE_ADAPTER_CIRCUIT_BREAKER_THRESHOLD`: failures before opening an adapter circuit
- `KEYLORE_ADAPTER_CIRCUIT_BREAKER_COOLDOWN_MS`: time before a tripped adapter circuit may be retried

## Secret bindings

Supported adapters are:

- `env`
- `vault`
- `1password`
- `aws_secrets_manager`
- `gcp_secret_manager`

An `env` binding such as:

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

Provider reference formats:

- `vault`: `kv/data/service#token?version=3`
- `1password`: `op://vault/item/field`
- `aws_secrets_manager`: `secret-id#jsonField?region=us-east-1&versionStage=AWSCURRENT`
- `gcp_secret_manager`: `secret-name#jsonField?project=my-project&version=latest`

For sandbox injection mode, bindings may also define `injectionEnvName`, for example `GITHUB_TOKEN`.

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
- `sandbox:run`
- `audit:read`
- `approval:read`
- `approval:review`
- `mcp:use`

Scopes gate endpoint families. Roles add separation of duties for sensitive actions such as approval review, audit reads, and auth-client inspection.

## Rotation and expiry reporting

KeyLore reports both:

- catalogue expiry from `credential.expiresAt`
- secret-source metadata when an adapter can inspect version, rotation, or expiry state

This is available through `GET /v1/catalog/reports`, `GET /v1/catalog/credentials/:id/report`, `GET /v1/system/adapters`, and the matching CLI/MCP admin surfaces.

## Operations and maintenance

Operational visibility is exposed through:

- `GET /metrics`
- `GET /readyz`
- `GET /v1/system/maintenance`

Deployment profiles are shipped through Helm values files:

- `charts/keylore/values-dev.yaml`
- `charts/keylore/values-staging.yaml`
- `charts/keylore/values-prod.yaml`

The maintenance loop expires stale approvals, revokes expired tokens, and removes old rate-limit buckets.

## Persistence model

The database is the system of record. `data/catalog.json`, `data/policies.json`, and `data/auth-clients.json` are bootstrap seed inputs only.

## Bootstrap behavior

If bootstrap is enabled and the database is empty, KeyLore imports catalogue records, policies, and auth clients from `data/`.

Auth client bootstrap is strict: missing `secretRef` environment variables fail startup instead of silently creating an unusable remote-auth setup.

## Local operator context

The local CLI uses `KEYLORE_DEFAULT_PRINCIPAL` and a built-in operator context with all current scopes plus `admin`, `operator`, `auditor`, and `approver` roles. Remote HTTP and MCP requests always use issued bearer tokens instead.
