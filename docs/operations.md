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
- break-glass workflow for explicitly approved emergency access
- dry-run and simulation paths that avoid outbound execution
- token revocation and auth-client lifecycle control for remote access
- adapter health reporting for configured secret providers
- sandboxed injection mode behind an explicit command allowlist
- sandbox env allowlisting and reserved-name protection
- egress policy that blocks private, loopback, and link-local targets unless explicitly allowed
- background cleanup of stale approvals, break-glass grants, expired tokens, and old rate-limit buckets
- logical backup and restore support through both the CLI and delegated API endpoints
- Helm-based Kubernetes deployment path with environment-specific values
- release workflow for tagged artifacts, SBOMs, scanning, and signing

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
13. create, approve, and list a `POST /v1/break-glass` request
14. export a logical backup with `POST /v1/system/backups/export` or `npm run dev:cli -- system backup create --file ./backup.json`
15. run `helm template keylore ./charts/keylore -f ./charts/keylore/values.yaml`
16. run `npm run test:contracts`
17. run `npm run test:conformance`
18. run `npm run test:hardening`
19. run `npm run ops:container-smoke`
20. open `http://127.0.0.1:8787/admin` for the interactive operator UI

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

Tenant-scoped backup operators are narrower than global operators:

- export only includes rows from their own tenant
- restore only replaces rows from their own tenant
- restore is rejected if the payload includes foreign-tenant records

Tenant-scoped auth administrators are also narrower than global operators:

- token and refresh-token actions are limited to their own tenant
- cross-tenant revoke attempts are rejected before state mutation

Automate the drill end to end:

```bash
KEYLORE_DATABASE_URL=postgresql://... \
KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET=... \
KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET=... \
npm run ops:restore-drill
```
