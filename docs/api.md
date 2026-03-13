# API

## REST endpoints

All `/v1/*` endpoints require a bearer token minted by `POST /oauth/token`. Most endpoints are scope-gated; some also require a role.

### `GET /.well-known/oauth-authorization-server`

Returns OAuth-style token metadata for the `client_credentials` grant.

### `GET /.well-known/oauth-protected-resource/api`

Returns protected-resource metadata for the REST API. Resource identifier: `<publicBaseUrl>/v1`.

### `GET /.well-known/oauth-protected-resource/mcp`

Returns protected-resource metadata for remote MCP. Resource identifier: `<publicBaseUrl>/mcp`.

### `POST /oauth/token`

Accepts `client_credentials` requests via form body or HTTP Basic auth.

Body fields:

- `grant_type=client_credentials`
- `client_id`
- `client_secret`
- `scope`
- `resource`

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

Lists approval requests.
Required scope: `approval:read`
Required role: `admin` or `approver`

### `POST /v1/approvals/:id/approve`

Approves a pending request.
Required scope: `approval:review`
Required role: `admin` or `approver`

### `POST /v1/approvals/:id/deny`

Denies a pending request.
Required scope: `approval:review`
Required role: `admin` or `approver`

### `GET /v1/auth/clients`

Lists configured OAuth clients without secret material.
Required scope: `auth:read`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/clients`

Creates an OAuth client and returns the generated or supplied secret exactly once.
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

Lists issued access tokens without exposing token material.
Required scope: `auth:read`
Required role: `admin` or `auth_admin`

### `POST /v1/auth/tokens/:id/revoke`

Revokes one issued access token.
Required scope: `auth:write`
Required role: `admin` or `auth_admin`

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

### `POST /v1/system/maintenance/run`

Runs maintenance immediately.
Required scope: `system:write`
Required role: `admin` or `maintenance_operator`

### `POST /v1/system/backups/export`

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

### `GET /v1/break-glass`

Lists break-glass requests with optional `status` and `requestedBy` filters.
Required scope: `breakglass:read`
Required role: `admin`, `approver`, `auditor`, or `breakglass_operator`

### `POST /v1/break-glass`

Creates a new break-glass request.
Required scope: `breakglass:request`
Required role: `admin` or `breakglass_operator`

### `POST /v1/break-glass/:id/approve`

Activates a pending break-glass request.
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
