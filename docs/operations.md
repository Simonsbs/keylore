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
4. optionally bootstraps catalogue and policy data from `data/catalog.json` and `data/policies.json` when the tables are empty
5. starts HTTP or stdio MCP transport

## Readiness

- `GET /healthz`: process liveness
- `GET /readyz`: database-backed readiness plus current credential count

## Current hardening controls

- bounded HTTP request body size
- in-memory IP rate limiting
- outbound request timeout
- outbound response size cap
- metadata-only catalogue responses
- default-deny policy enforcement

## Migration policy

- schema changes go into monotonic SQL files in `migrations/`
- migrations run automatically on startup
- bootstrap files are seed sources only, not the system of record
