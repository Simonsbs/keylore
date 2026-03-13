# Architecture

## Current shape

KeyLore v0.1 is a single TypeScript service with two entry modes:

- `stdio` MCP transport for local tool execution
- Streamable HTTP MCP transport plus REST endpoints for remote or service deployment

The runtime is organized into five layers:

1. Catalogue repository
2. Policy repository and evaluation
3. Secret adapter
4. Broker service and constrained proxy executor
5. MCP and HTTP presentation layers

## Core flow

1. The client searches the catalogue through `catalog_search`.
2. KeyLore returns metadata-only credential summaries.
3. The client requests an action through `access_request`.
4. KeyLore evaluates policy, credential status, domain allowlists, and operation allowlists.
5. If authorized, KeyLore resolves the secret via the adapter.
6. KeyLore performs the external request itself and returns only a sanitized result.
7. Search, authorization, and use are written to the audit log.

## Storage

- `data/catalog.json`: non-secret credential metadata and adapter bindings
- `data/policies.json`: policy rules
- `data/audit.ndjson`: append-only audit events

Secret values are not stored in these files.

## Design constraints

- default-deny authorization
- no raw credentials in MCP outputs
- no raw credentials in audit events
- HTTPS-only proxy targets, except local loopback development
- auth-related user headers are stripped before proxy execution

## Why this is not split into microservices yet

`KeyLore.md` describes a larger system, but v0.1 keeps the broker, catalogue, and MCP surface in one process to reduce operational complexity while the security model stabilizes. The seams already exist in the codebase for later extraction.
