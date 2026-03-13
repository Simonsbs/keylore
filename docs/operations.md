# Operations

## Local stack

Start the local PostgreSQL dependency:

```bash
npm run db:up
```

Stop it:

```bash
npm run db:down
```

## Startup sequence

On process startup KeyLore now:

1. validates environment configuration
2. opens a PostgreSQL connection pool
3. runs SQL migrations from `migrations/`
4. optionally bootstraps catalogue, policy, and OAuth client data from `data/` when the tables are empty
5. starts HTTP or stdio MCP transport

## Readiness

- `GET /healthz`: process liveness
- `GET /readyz`: database-backed readiness plus current credential count
- `GET /.well-known/oauth-authorization-server`: token metadata
- `GET /.well-known/oauth-protected-resource/api`: REST protected-resource metadata
- `GET /.well-known/oauth-protected-resource/mcp`: MCP protected-resource metadata

## Current hardening controls

- bounded HTTP request body size
- in-memory IP rate limiting
- resource-bound bearer token validation
- role-aware endpoint authorization
- outbound request timeout
- outbound response size cap
- metadata-only catalogue responses
- default-deny policy enforcement
- approval workflow for policy rules that require human review

## Local verification flow

With `.env` populated, a minimal smoke test is:

1. `npm run db:up`
2. `npm run build`
3. `node dist/index.js --transport http`
4. mint an API token through `POST /oauth/token`
5. call `POST /v1/catalog/search` with `Authorization: Bearer ...`
6. call `GET /.well-known/oauth-protected-resource/mcp`
7. request an approval-gated action, approve it, and retry with `approvalId`

## Migration policy

- schema changes go into monotonic SQL files in `migrations/`
- migrations run automatically on startup
- bootstrap files are seed sources only, not the system of record
