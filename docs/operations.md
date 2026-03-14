# Operations

## Local stack

The fastest local path is now:

```bash
npm install
npm run quickstart
```

Then open `http://127.0.0.1:8787/admin` and use the `Use local admin quickstart` button.

If you want to override defaults, create `.env` from `.env.example`. KeyLore auto-loads `.env` on startup; you do not need to export it manually.

Start only the local PostgreSQL dependency:

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

1. `npm run quickstart`
2. open `http://127.0.0.1:8787/admin`
3. use `Use local admin quickstart`
4. verify tenants, auth clients, approvals, backups, audit, and system panels load
5. run `npm run ops:release-verify`

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
