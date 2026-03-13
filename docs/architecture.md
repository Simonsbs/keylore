# Architecture

## Current shape

KeyLore v0.7 is a single TypeScript service with two entry modes:

- `stdio` MCP transport for local tool execution
- Streamable HTTP MCP transport plus REST endpoints for remote or service deployment

The runtime is organized into nine layers:

1. Catalogue repository
2. Policy repository and evaluation
3. Secret adapter registry and provider plugins
4. Broker service, constrained proxy executor, and status reporting
5. Sandboxed runtime injection executor
6. Database-backed rate limiting, break-glass state, and maintenance
7. Backup/export tooling
8. Release and deployment packaging
9. MCP and HTTP presentation layers

## Core flow

1. The client searches the catalogue through `catalog_search`.
2. KeyLore returns metadata-only credential summaries.
3. The client requests an action through `access_request`.
4. KeyLore evaluates policy, credential status, domain allowlists, and operation allowlists.
5. If authorized, KeyLore resolves the secret via the adapter registry.
6. KeyLore performs the external request itself and returns only a sanitized result.
7. Search, authorization, and use are written to the audit log.
8. For restricted compatibility cases, KeyLore can instead inject the secret into an allowlisted child process and scrub captured output before return.

## Storage

System of record:

- PostgreSQL `credentials`
- PostgreSQL `policy_rules`
- PostgreSQL `audit_events`
- PostgreSQL `oauth_clients`
- PostgreSQL `access_tokens`
- PostgreSQL `approval_requests`
- PostgreSQL `break_glass_requests`
- PostgreSQL `request_rate_limits`
- PostgreSQL `schema_migrations`

Bootstrap seed inputs:

- `data/catalog.json`
- `data/policies.json`

Secret values are not stored in either the seed files or the database.

## Design constraints

- default-deny authorization
- no raw credentials in MCP outputs
- no raw credentials in audit events
- HTTPS-only proxy targets, except local loopback development, with blocked private/link-local ranges by default
- auth-related user headers are stripped before proxy execution
- HTTP request size and response capture are bounded
- outbound requests are bounded by timeout
- delegated auth, maintenance, backup, and break-glass operations require distinct scopes and roles
- shared rate limiting is enforced through PostgreSQL state instead of per-process memory
- background maintenance expires stale approvals and break-glass grants, revokes expired access tokens, and reaps old rate-limit buckets
- logical backups operate at the application data model, not through opaque database dumps
- Kubernetes deployment is shipped as a Helm chart with environment profiles

## Why this is not split into microservices yet

`KeyLore.md` describes a larger system, but v0.7 still keeps the broker, catalogue, and MCP surface in one process to reduce operational complexity while the security model stabilizes. The seams already exist in the codebase for later extraction.
