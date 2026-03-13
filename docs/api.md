# API

## REST endpoints

### `GET /healthz`

Returns a basic liveness payload.

### `GET /readyz`

Returns readiness status and the current credential count.

### `GET /v1/catalog/credentials`

Returns safe credential summaries.

### `POST /v1/catalog/credentials`

Creates a credential metadata record. Secret material is still external and referenced by binding only.

### `GET /v1/catalog/credentials/:id`

Returns one safe credential summary.

### `PATCH /v1/catalog/credentials/:id`

Updates mutable credential metadata.

### `DELETE /v1/catalog/credentials/:id`

Deletes a credential metadata record.

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

### `POST /v1/access/request`

Body fields:

- `credentialId`
- `operation`
- `targetUrl`
- `headers`
- `payload`

Response fields:

- `decision`
- `reason`
- `correlationId`
- `credential`
- `ruleId`
- `httpResult`

### `GET /v1/audit/events?limit=20`

Returns recent audit events in reverse chronological order.

## MCP tools

### `catalog_search`

Search credential metadata only.

### `catalog_get`

Read one credential metadata record by ID.

### `access_request`

Evaluate policy and execute a constrained proxy call if authorized.

### `audit_recent`

Read recent audit events.

## Local CLI

KeyLore also exposes a local operator CLI documented in [docs/cli.md](/home/simon/keylore/docs/cli.md). This is the preferred local administration surface until a dedicated admin UI exists.
