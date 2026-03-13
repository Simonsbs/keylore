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
5. starts the background maintenance loop
6. starts HTTP or stdio MCP transport

## Readiness

- `GET /healthz`: process liveness
- `GET /readyz`: database-backed readiness plus current credential count and maintenance status
- `GET /metrics`: Prometheus-style counters, gauges, and summaries
- `GET /.well-known/oauth-authorization-server`: token metadata
- `GET /.well-known/oauth-protected-resource/api`: REST protected-resource metadata
- `GET /.well-known/oauth-protected-resource/mcp`: MCP protected-resource metadata

## Current hardening controls

- bounded HTTP request body size
- PostgreSQL-backed client rate limiting
- resource-bound bearer token validation
- role-aware endpoint authorization
- outbound request timeout
- outbound response size cap
- metadata-only catalogue responses
- default-deny policy enforcement
- approval workflow for policy rules that require human review
- dry-run and simulation paths that avoid outbound execution
- token revocation and auth-client lifecycle control for remote access
- adapter health reporting for configured secret providers
- sandboxed injection mode behind an explicit command allowlist
- background cleanup of stale approvals, expired tokens, and old rate-limit buckets
- logical backup and restore support through the CLI

## Local verification flow

With `.env` populated, a minimal smoke test is:

1. `npm run db:up`
2. `npm run build`
3. `node dist/index.js --transport http`
4. mint an API token through `POST /oauth/token`
5. call `POST /v1/catalog/search` with `Authorization: Bearer ...`
6. call `POST /v1/access/simulate` to verify dry-run evaluation
7. call `GET /.well-known/oauth-protected-resource/mcp`
8. request an approval-gated action, approve it, and retry with `approvalId`
9. create a temporary auth client, mint a token for it, and revoke that token
10. call `GET /v1/catalog/reports` to confirm rotation/expiry reporting
11. call `POST /v1/runtime/sandbox` with an allowlisted command to verify injected execution and output scrubbing
12. call `GET /metrics` and `GET /v1/system/maintenance`
13. create and inspect a logical backup with `npm run dev:cli -- system backup create --file ./backup.json`

## Migration policy

- schema changes go into monotonic SQL files in `migrations/`
- migrations run automatically on startup
- bootstrap files are seed sources only, not the system of record

## Recovery

Create a logical backup:

```bash
npm run dev:cli -- system backup create --file ./keylore-backup.json
```

Inspect a logical backup:

```bash
npm run dev:cli -- system backup inspect --file ./keylore-backup.json
```

Restore a logical backup:

```bash
npm run dev:cli -- system backup restore --file ./keylore-backup.json --yes
```
