# API

## REST endpoints

All `/v1/*` endpoints require a bearer token minted by `POST /oauth/token`. Most endpoints are scope-gated; some also require a role.

KeyLore echoes an `x-trace-id` response header on HTTP requests. Callers may supply their own `x-trace-id` header to correlate approval, break-glass, and notification activity.

Remote bearer tokens inherit the tenant of the OAuth client that minted them. Tenant-scoped callers only see and mutate records from their own tenant. Cross-tenant reads are hidden as not found; cross-tenant writes are rejected with `403`.

### `GET /.well-known/oauth-authorization-server`

Returns OAuth-style metadata for `client_credentials`, `authorization_code`, and `refresh_token`.

### `GET /.well-known/oauth-protected-resource/api`

Returns protected-resource metadata for the REST API. Resource identifier: `<publicBaseUrl>/v1`.

### `GET /.well-known/oauth-protected-resource/mcp`

Returns protected-resource metadata for remote MCP. Resource identifier: `<publicBaseUrl>/mcp`.

### `POST /oauth/authorize`

Accepts an already-authenticated bearer token plus a PKCE challenge and returns a short-lived authorization code for the requested client.

Body fields:

- `clientId`
- `redirectUri`
- `scope`
- `resource`
- `codeChallenge`
- `codeChallengeMethod=S256`
- `state`

### `POST /oauth/token`

Accepts `client_credentials`, `authorization_code`, and `refresh_token` requests via form body or HTTP Basic auth when the client auth method requires it.

Body fields:

- `grant_type=client_credentials`
- `grant_type=authorization_code`
- `grant_type=refresh_token`
- `client_id`
- `client_secret`
- `scope`
- `resource`
- `code`
- `code_verifier`
- `redirect_uri`
- `refresh_token`
- `client_assertion_type`
- `client_assertion`

`client_secret_basic`, `client_secret_post`, `private_key_jwt`, and `none` are supported depending on the client configuration. `private_key_jwt` assertions are replay-protected; a reused assertion is rejected with `409`.

### `GET /healthz`

Returns a basic liveness payload.

### `GET /readyz`

Returns readiness status, the current credential count, and maintenance-loop status.

### `GET /metrics`

Returns Prometheus-style process and application metrics.

### `GET /v1/catalog/credentials`

Returns safe credential summaries.
Required scope: `catalog:read`

### `POST /v1/catalog/credentials`

Creates a credential metadata record. Secret material is still external and referenced by binding only.
`tenantId` may be supplied by a global operator. Tenant-scoped remote callers may only create credentials inside their own tenant.
Required scope: `catalog:write`
Required role: `admin` or `operator`

### `GET /v1/catalog/credentials/:id`

Returns one safe credential summary.
Required scope: `catalog:read`

### `PATCH /v1/catalog/credentials/:id`

Updates mutable credential metadata.
Required scope: `catalog:write`
Required role: `admin` or `operator`

### `DELETE /v1/catalog/credentials/:id`

Deletes a credential metadata record.
Required scope: `catalog:write`
Required role: `admin` or `operator`

### `POST /v1/catalog/search`

Body fields:

- `query`
- `service`
- `owner`
- `scopeTier`
- `sensitivity`
- `status`
- `tag`
- `limit`

Required scope: `catalog:read`

### `POST /v1/access/request`

Body fields:

- `credentialId`
- `operation`
- `targetUrl`
- `headers`
- `payload`
- `approvalId`
- `breakGlassId`

Response fields:

- `decision`
- `reason`
- `correlationId`
- `credential`
- `ruleId`
- `httpResult`
- `approvalRequestId`

Required scope: `broker:use`

### `POST /v1/access/simulate`

Evaluates policy for an access request without creating approval side effects or executing the outbound call.
Required scope: `broker:use`

### `POST /v1/runtime/sandbox`

Runs a tightly allowlisted command in sandbox injection mode with a secret exposed only to that child process environment. Output is scrubbed before return.
Required scope: `sandbox:run`
Required role: `admin` or `operator`

### `GET /v1/audit/events?limit=20`

Returns recent audit events in reverse chronological order.
Required scope: `audit:read`
Required role: `admin` or `auditor`

### `GET /v1/approvals`

Lists approval requests, including quorum counters and review history.
Required scope: `approval:read`
Required role: `admin` or `approver`

### `POST /v1/approvals/:id/approve`

Approves a pending request. If the configured review quorum is not yet met, the request remains `pending`.
Required scope: `approval:review`
Required role: `admin` or `approver`

### `POST /v1/approvals/:id/deny`

Denies a pending request immediately. Duplicate reviews from the same reviewer are rejected.
Required scope: `approval:review`
Required role: `admin` or `approver`

### `GET /v1/auth/clients`

Lists configured OAuth clients without secret material.
Required scope: `auth:read`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/clients`

Creates an OAuth client and returns the generated or supplied secret exactly once.
`tenantId` may be supplied by a global operator. Tenant-scoped remote callers may only create clients inside their own tenant.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

### `PATCH /v1/auth/clients/:id`

Updates auth-client display name, roles, scopes, or status. Security-relevant changes revoke the client's active tokens.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/clients/:id/rotate-secret`

Rotates the client secret and revokes the client's active tokens.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/clients/:id/enable`

Re-enables a disabled auth client.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/clients/:id/disable`

Disables an auth client and revokes its active tokens.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

### `GET /v1/auth/tokens`

Lists issued access tokens without exposing token material. Tenant-scoped callers only see tokens from their own tenant.
Required scope: `auth:read`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/tokens/:id/revoke`

Revokes one issued access token.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

### `GET /v1/auth/refresh-tokens`

Lists issued refresh tokens without exposing token material. Tenant-scoped callers only see tokens from their own tenant.
Required scope: `auth:read`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/refresh-tokens/:id/revoke`

Revokes one issued refresh token.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

### `GET /v1/tenants`

Lists visible tenants and basic per-tenant counts.
Required scope: `admin:read`
Required role: `admin`

### `POST /v1/tenants`

Creates one tenant record.
Required scope: `admin:write`
Required role: `admin`

### `POST /v1/tenants/bootstrap`

Creates a tenant and optional seed auth clients in one call.
Required scope: `admin:write`
Required role: `admin`

### `GET /v1/tenants/:id`

Returns one tenant summary.
Required scope: `admin:read`
Required role: `admin`

### `PATCH /v1/tenants/:id`

Updates tenant display name, description, or status.
Required scope: `admin:write`
Required role: `admin`

### `GET /v1/catalog/reports`

Lists credential rotation and expiry reports without exposing secret values.
Required scope: `catalog:read`
Required role: `admin`, `operator`, or `auditor`

### `GET /v1/catalog/credentials/:id/report`

Returns one credential rotation and expiry report.
Required scope: `catalog:read`
Required role: `admin`, `operator`, or `auditor`

### `GET /v1/system/adapters`

Returns adapter availability and health.
Required scope: `system:read`
Required role: `admin`, `maintenance_operator`, or `auditor`

### `GET /v1/system/maintenance`

Returns maintenance-loop status and the last cleanup result.
Required scope: `system:read`
Required role: `admin`, `maintenance_operator`, or `auditor`

### `GET /v1/system/traces`

Returns recent in-memory trace spans. Optional query params:

- `limit`
- `traceId`

Required scope: `system:read`
Required role: `admin`, `maintenance_operator`, or `auditor`

### `GET /v1/system/trace-exporter`

Returns the external trace-export pipeline status, pending queue depth, last flush time, and last error.
Required scope: `system:read`
Required role: `admin`, `maintenance_operator`, or `auditor`

### `POST /v1/system/maintenance/run`

Runs maintenance immediately.
Required scope: `system:write`
Required role: `admin` or `maintenance_operator`

### `POST /v1/system/trace-exporter/flush`

Flushes the queued trace-export batch immediately and returns the updated exporter status.
Required scope: `system:write`
Required role: `admin` or `maintenance_operator`

### `POST /v1/system/backups/export`

Exports a logical backup. Tenant-scoped backup operators receive a tenant-scoped backup only.
Required scope: `backup:read`
Required role: `admin` or `backup_operator`

### `POST /v1/system/backups/inspect`

Inspects a logical backup summary.
Required scope: `backup:read`
Required role: `admin` or `backup_operator`

### `POST /v1/system/backups/restore`

Restores a logical backup. Tenant-scoped backup operators may restore only backups that contain their own tenant data and only replace rows inside that tenant.
Required scope: `backup:write`
Required role: `admin` or `backup_operator`

Exports a logical backup payload directly over the API.
Required scope: `backup:read`
Required role: `admin` or `backup_operator`

### `POST /v1/system/backups/inspect`

Validates and summarizes a supplied logical backup payload.
Required scope: `backup:read`
Required role: `admin` or `backup_operator`

### `POST /v1/system/backups/restore`

Restores a supplied logical backup payload when `confirm=true`.
Required scope: `backup:write`
Required role: `admin` or `backup_operator`

### `GET /v1/system/rotations`

Lists rotation workflow runs. Optional filters:

- `status`
- `credentialId`

Required scope: `system:read`
Required role: `admin`, `operator`, `maintenance_operator`, or `auditor`

### `POST /v1/system/rotations`

Creates a manual rotation run for one credential.
Required scope: `system:write`
Required role: `admin`, `operator`, or `maintenance_operator`

### `POST /v1/system/rotations/plan`

Creates pending rotation runs for credentials due within the supplied planning horizon.
Required scope: `system:write`
Required role: `admin`, `operator`, or `maintenance_operator`

### `POST /v1/system/rotations/:id/start`

Marks a pending rotation run as `in_progress`.
Required scope: `system:write`
Required role: `admin`, `operator`, or `maintenance_operator`

### `POST /v1/system/rotations/:id/complete`

Marks a rotation run completed and may update the credential binding reference, expiry, and validation timestamp.
Required scope: `system:write`
Required role: `admin`, `operator`, or `maintenance_operator`

### `POST /v1/system/rotations/:id/fail`

Marks a rotation run failed without mutating the credential binding.
Required scope: `system:write`
Required role: `admin`, `operator`, or `maintenance_operator`

### `GET /v1/break-glass`

Lists break-glass requests with optional `status` and `requestedBy` filters, including quorum counters and review history.
Required scope: `breakglass:read`
Required role: `admin`, `approver`, `auditor`, or `breakglass_operator`

### `POST /v1/break-glass`

Creates a new break-glass request.
Required scope: `breakglass:request`
Required role: `admin` or `breakglass_operator`

### `POST /v1/break-glass/:id/approve`

Reviews a pending break-glass request. The request becomes `active` only after the configured review quorum is met.
Required scope: `breakglass:review`
Required role: `admin` or `approver`

### `POST /v1/break-glass/:id/deny`

Denies a pending break-glass request.
Required scope: `breakglass:review`
Required role: `admin` or `approver`

### `POST /v1/break-glass/:id/revoke`

Revokes an active break-glass request.
Required scope: `breakglass:review`
Required role: `admin`, `approver`, or `breakglass_operator`

## Notification webhooks

If notifications are configured, KeyLore sends JSON envelopes with:

- `id`
- `type`
- `occurredAt`
- `traceId`
- `payload`

Headers include:

- `x-keylore-event-type`
- `x-keylore-event-id`
- optional `x-keylore-signature`

## MCP tools

### `catalog_search`

Search credential metadata only.

### `catalog_get`

Read one credential metadata record by ID.

### `access_request`

Evaluate policy and execute a constrained proxy call if authorized.

### `policy_simulate`

Evaluate policy for a proposed access request without executing it.

### `catalog_report`

Inspect credential rotation and expiry status.

### `system_adapters`

Read adapter health and availability.

### `system_maintenance_status`

Read background maintenance status.

### `break_glass_request`

Create an emergency-access request.

### `break_glass_list`

List emergency-access requests.

### `break_glass_review`

Approve, deny, or revoke an emergency-access request.

### `runtime_run_sandboxed`

Run an allowlisted injected command with scrubbed output.

### `audit_recent`

Read recent audit events.
Requires `audit:read` and `admin` or `auditor`.

## Local CLI

KeyLore also exposes a local operator CLI documented in [docs/cli.md](/home/simon/keylore/docs/cli.md). This is the preferred local administration surface until a dedicated admin UI exists.

For deployment and release packaging, see [docs/deployment.md](/home/simon/keylore/docs/deployment.md).
