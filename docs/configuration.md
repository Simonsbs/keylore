# Configuration

KeyLore auto-loads `.env` from the working directory when it exists. Shell export is optional for local use.

For loopback development instances, KeyLore also enables a bounded local quickstart profile by default:

- `KEYLORE_DATABASE_URL` falls back to `postgresql://keylore:keylore@127.0.0.1:5432/keylore`
- `KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET` falls back to `keylore-local-admin`
- `KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET` falls back to `keylore-local-consumer`

Those development defaults are only applied when the server is running on a loopback host and `KEYLORE_ENVIRONMENT` is not `production`.

In practice this creates two modes:

- `core` mode
  - local quickstart
  - local encrypted secret storage
  - shortest path to credential onboarding and MCP connection
- `advanced` mode
  - explicit production-style configuration
  - external secret backends, OAuth clients, approvals, tenancy, and deployment controls

Use [docs/production-handoff.md](/home/simon/keylore/docs/production-handoff.md) to decide when to move from one to the other.

## Environment variables

- `KEYLORE_DATABASE_URL`: PostgreSQL connection string
- `KEYLORE_DATABASE_POOL_MAX`: max PostgreSQL pool size
- `KEYLORE_DATA_DIR`: base directory for catalogue, policy, and auth-client seed files
- `KEYLORE_CATALOG_FILE`: catalogue filename inside the data dir
- `KEYLORE_POLICY_FILE`: policy filename inside the data dir
- `KEYLORE_AUTH_CLIENTS_FILE`: OAuth client bootstrap filename inside the data dir
- `KEYLORE_LOCAL_SECRETS_FILE`: encrypted local secret-store filename inside the data dir
- `KEYLORE_LOCAL_SECRETS_KEY_FILE`: local secret-store key filename inside the data dir
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
- `KEYLORE_AUTHORIZATION_CODE_TTL_SECONDS`: authorization code lifetime
- `KEYLORE_REFRESH_TOKEN_TTL_SECONDS`: refresh token lifetime
- `KEYLORE_APPROVAL_TTL_SECONDS`: pending approval lifetime
- `KEYLORE_APPROVAL_REVIEW_QUORUM`: distinct reviews required before an approval request becomes approved
- `KEYLORE_BREAKGLASS_MAX_DURATION_SECONDS`: max lifetime for an approved break-glass request
- `KEYLORE_BREAKGLASS_REVIEW_QUORUM`: distinct reviews required before a break-glass request becomes active
- `KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET`: seed secret for `keylore-admin-local`
- `KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET`: seed secret for `keylore-consumer-local`
- `KEYLORE_VAULT_ADDR`: Vault base URL for the Vault adapter
- `KEYLORE_VAULT_TOKEN`: Vault token for secret reads and metadata inspection
- `KEYLORE_VAULT_NAMESPACE`: optional Vault namespace
- `KEYLORE_OP_BIN`: 1Password CLI binary path or name
- `KEYLORE_AWS_BIN`: AWS CLI binary path or name
- `KEYLORE_GCLOUD_BIN`: gcloud CLI binary path or name
- `KEYLORE_EGRESS_ALLOW_PRIVATE_IPS`: allow private/link-local/loopback upstream targets
- `KEYLORE_EGRESS_ALLOWED_HOSTS`: comma-separated explicit host allowlist for egress exceptions
- `KEYLORE_EGRESS_ALLOWED_HTTPS_PORTS`: comma-separated HTTPS destination port allowlist
- `KEYLORE_SANDBOX_INJECTION_ENABLED`: enables sandbox injection mode
- `KEYLORE_SANDBOX_COMMAND_ALLOWLIST`: comma-separated executable allowlist for sandbox mode
- `KEYLORE_SANDBOX_ENV_ALLOWLIST`: comma-separated env names callers may pass into sandbox execution
- `KEYLORE_SANDBOX_DEFAULT_TIMEOUT_MS`: default sandbox runtime timeout
- `KEYLORE_SANDBOX_MAX_OUTPUT_BYTES`: max captured sandbox output after redaction
- `KEYLORE_ADAPTER_MAX_ATTEMPTS`: adapter retry attempts for transient failures
- `KEYLORE_ADAPTER_RETRY_DELAY_MS`: adapter retry backoff base
- `KEYLORE_ADAPTER_CIRCUIT_BREAKER_THRESHOLD`: failures before opening an adapter circuit
- `KEYLORE_ADAPTER_CIRCUIT_BREAKER_COOLDOWN_MS`: time before a tripped adapter circuit may be retried
- `KEYLORE_NOTIFICATION_WEBHOOK_URL`: optional lifecycle notification destination
- `KEYLORE_NOTIFICATION_SIGNING_SECRET`: optional HMAC secret for webhook signatures
- `KEYLORE_NOTIFICATION_TIMEOUT_MS`: notification delivery timeout
- `KEYLORE_TRACE_CAPTURE_ENABLED`: enable in-memory recent trace capture
- `KEYLORE_TRACE_RECENT_SPAN_LIMIT`: recent trace span retention limit
- `KEYLORE_TRACE_EXPORT_URL`: optional HTTP endpoint for batched trace export
- `KEYLORE_TRACE_EXPORT_AUTH_HEADER`: optional `Authorization` header value for the trace export endpoint
- `KEYLORE_TRACE_EXPORT_BATCH_SIZE`: max spans per export batch
- `KEYLORE_TRACE_EXPORT_INTERVAL_MS`: background trace export interval
- `KEYLORE_TRACE_EXPORT_TIMEOUT_MS`: timeout for each trace export call
- `KEYLORE_ROTATION_PLANNING_HORIZON_DAYS`: default planning horizon for automatic rotation planning

## Secret bindings

Supported adapters are:

- `local`
- `env`
- `vault`
- `1password`
- `aws_secrets_manager`
- `gcp_secret_manager`

The `local` adapter is the default core-mode storage path for quickstart installs. It stores the raw secret in the local encrypted file store and keeps only the reference in the credential catalogue.

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
- `POST /oauth/authorize`
- `POST /oauth/token`

Remote callers use `client_credentials`, `authorization_code`, or `refresh_token` depending on client configuration. Tokens may be resource-bound:

- use `resource=<publicBaseUrl>/v1` for REST API access
- use `resource=<publicBaseUrl>/mcp` for remote MCP access

If a token is resource-bound, KeyLore rejects it on the wrong protected resource.

Supported client authentication methods are:

- `client_secret_basic`
- `client_secret_post`
- `private_key_jwt`
- `none`

`private_key_jwt` clients must be configured with at least one public JWK and do not use shared secrets.

Public clients use `tokenEndpointAuthMethod: "none"` plus `grantTypes: ["authorization_code", "refresh_token"]`, a redirect URI allowlist, and PKCE with `S256`.

## Multi-tenant model

KeyLore stores first-class tenant records and also stores `tenantId` on credentials, policy rules, OAuth clients, approvals, break-glass requests, audit events, access tokens, refresh tokens, and rotation runs. Bootstrapped records may omit it and fall back to `default`.

Remote HTTP and MCP callers inherit their tenant from the OAuth client used at `POST /oauth/token`. Tenant-scoped callers are restricted to that tenant. The local CLI continues to run as a global operator context and may work across tenants.

Tenant administration is available through `GET/POST/PATCH /v1/tenants`, `POST /v1/tenants/bootstrap`, and the matching CLI commands.

## Approvals and break-glass quorum

Approval and break-glass requests are persisted with:

- `requiredApprovals`
- `approvalCount`
- `denialCount`
- `reviews`

Any denial finalizes the request as denied. Approvals require distinct reviewers; the same reviewer cannot count twice.

## Notifications and traces

When `KEYLORE_NOTIFICATION_WEBHOOK_URL` is configured, KeyLore emits signed JSON webhook envelopes for approval and break-glass lifecycle events. If `KEYLORE_NOTIFICATION_SIGNING_SECRET` is set, KeyLore includes an `x-keylore-signature` HMAC-SHA256 header over the raw JSON body.

When trace capture is enabled, KeyLore records recent spans in memory and propagates `x-trace-id` from inbound HTTP requests into approval, break-glass, notification, and rotation spans.

If `KEYLORE_TRACE_EXPORT_URL` is configured, KeyLore also batches spans to that endpoint and exposes operator status through `GET /v1/system/trace-exporter`.

## Roles and scopes

Built-in roles are:

- `admin`
- `auth_admin`
- `operator`
- `maintenance_operator`
- `backup_operator`
- `breakglass_operator`
- `auditor`
- `approver`
- `consumer`

Built-in scopes are:

- `catalog:read`
- `catalog:write`
- `admin:read`
- `admin:write`
- `auth:read`
- `auth:write`
- `broker:use`
- `sandbox:run`
- `audit:read`
- `approval:read`
- `approval:review`
- `system:read`
- `system:write`
- `backup:read`
- `backup:write`
- `breakglass:request`
- `breakglass:read`
- `breakglass:review`
- `mcp:use`

Scopes gate endpoint families. Roles add separation of duties for sensitive actions such as auth administration, maintenance, backup restore, audit reads, approval review, and break-glass review.

## Rotation and expiry reporting

KeyLore reports both:

- catalogue expiry from `credential.expiresAt`
- secret-source metadata when an adapter can inspect version, rotation, or expiry state

This is available through `GET /v1/catalog/reports`, `GET /v1/catalog/credentials/:id/report`, `GET /v1/system/adapters`, and the matching CLI/MCP admin surfaces.

Rotation workflows are exposed through:

- `GET /v1/system/rotations`
- `POST /v1/system/rotations`
- `POST /v1/system/rotations/plan`
- `POST /v1/system/rotations/:id/start`
- `POST /v1/system/rotations/:id/complete`
- `POST /v1/system/rotations/:id/fail`

## Operations and maintenance

Operational visibility is exposed through:

- `GET /metrics`
- `GET /readyz`
- `GET /v1/system/maintenance`
- `GET /v1/system/traces`
- `GET /v1/system/trace-exporter`

Deployment profiles are shipped through Helm values files:

- `charts/keylore/values-dev.yaml`
- `charts/keylore/values-staging.yaml`
- `charts/keylore/values-prod.yaml`
- `charts/keylore/values-ha.yaml`

The maintenance loop expires stale approvals, break-glass grants, access tokens, refresh tokens, and authorization codes, and removes old rate-limit buckets.

## Persistence model

The database is the system of record. `data/catalog.json`, `data/policies.json`, and `data/auth-clients.json` are bootstrap seed inputs only.

## Bootstrap behavior

If bootstrap is enabled and the database is empty, KeyLore imports catalogue records, policies, and auth clients from `data/`.

Auth client bootstrap is strict for shared-secret clients: missing `secretRef` environment variables fail startup instead of silently creating an unusable remote-auth setup. `private_key_jwt` clients bootstrap from their public JWK set and do not require `secretRef`. Public `none` clients bootstrap without `secretRef` but must provide redirect URIs and authorization-code grant types.

## Local operator context

The local CLI uses `KEYLORE_DEFAULT_PRINCIPAL` and a built-in operator context with all current scopes plus the privileged admin/operator roles. That local context is not tenant-scoped, which is intentional for self-hosted administration. Remote HTTP and MCP requests always use issued bearer tokens instead.
