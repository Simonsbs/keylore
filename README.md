# KeyLore

KeyLore is a credential broker and searchable credential catalogue for MCP clients such as Codex CLI, Claude Code, and other Model Context Protocol toolchains.

The design goal comes directly from the local `KeyLore.md` production spec used to bootstrap this repository: let agents discover and use the right credential metadata without ever putting secret values into model context, prompts, logs, or tool results.

## Status

This repository is incubating privately today, but it is structured to be published as open source without a cleanup pass. The repo already includes:

- an Apache-2.0 project license and `NOTICE`
- contributor and security policies
- CI, container packaging, and deployment examples
- architecture, API, threat model, and roadmap docs

## What is implemented now

- MCP server for `stdio` and Streamable HTTP
- metadata-only catalogue search and retrieval tools
- default-deny policy engine with domain and operation constraints
- PostgreSQL-backed catalogue, policy, and audit persistence with startup migrations
- OAuth-style client credentials token issuance for remote HTTP and MCP access
- protected-resource metadata for REST and MCP surfaces
- identity-aware policy evaluation with role-aware rule matching
- approval-required policy outcomes with review endpoints and CLI support
- RBAC separation for admin, operator, auditor, approver, and consumer clients
- environment-backed secret adapter
- constrained proxy execution for `http.get` and `http.post`
- HTTP admin/API surface for catalogue search, access requests, approvals, audit reads, and auth-client inspection
- local admin CLI for catalogue, approvals, auth-client, and audit operations
- request-size limits, in-memory rate limiting, outbound timeouts, and response-size caps

## What is intentionally deferred

The full `KeyLore.md` specification is broader than a sane v0.3 delivery. This repo does not yet implement:

- secret-store adapters beyond environment variables
- sandboxed injection mode
- multi-tenant isolation, delegated approvals, and break-glass workflows
- admin UI and rotation orchestration

Those items are tracked in [docs/roadmap.md](/home/simon/keylore/docs/roadmap.md) and mapped back to the spec in [docs/keylore-spec-map.md](/home/simon/keylore/docs/keylore-spec-map.md).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and populate the demo secret refs and bootstrap client secrets:

```bash
KEYLORE_SECRET_GITHUB_READONLY=...
KEYLORE_SECRET_NPM_READONLY=...
KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET=...
KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET=...
```

3. Start PostgreSQL:

```bash
npm run db:up
```

4. Start the HTTP server:

```bash
npm run dev:http
```

5. Or run KeyLore as a local stdio MCP server:

```bash
npm run dev:stdio
```

6. Use the local CLI:

```bash
npm run dev:cli -- catalog list
```

7. Mint an access token for the REST API:

```bash
curl -X POST http://127.0.0.1:8787/oauth/token \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=keylore-admin-local&client_secret=REPLACE_ME&scope=catalog:read%20broker:use%20approval:read%20approval:review%20audit:read%20admin:read&resource=http://127.0.0.1:8787/v1'
```

8. Verify the health endpoint:

```bash
curl http://127.0.0.1:8787/healthz
```

## Example API usage

Search the catalogue:

```bash
TOKEN=...
curl -X POST http://127.0.0.1:8787/v1/catalog/search \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"query":"github","limit":5}'
```

Request a proxy call:

```bash
TOKEN=...
curl -X POST http://127.0.0.1:8787/v1/access/request \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "credentialId":"github-readonly-demo",
    "operation":"http.get",
    "targetUrl":"https://api.github.com/repos/modelcontextprotocol/specification"
  }'
```

## Example Codex configuration

See [examples/codex/config.toml](/home/simon/keylore/examples/codex/config.toml) for both `stdio` and remote HTTP MCP registration examples. For remote MCP, mint a token with `resource=http://127.0.0.1:8787/mcp` and export it into the configured client env var.

## CLI examples

List the catalogue:

```bash
npm run dev:cli -- catalog list
```

Search the catalogue:

```bash
npm run dev:cli -- catalog search --query github --limit 5
```

Read recent audit events:

```bash
npm run dev:cli -- audit recent --limit 10
```

## Documentation

- [docs/architecture.md](/home/simon/keylore/docs/architecture.md)
- [docs/api.md](/home/simon/keylore/docs/api.md)
- [docs/configuration.md](/home/simon/keylore/docs/configuration.md)
- [docs/cli.md](/home/simon/keylore/docs/cli.md)
- [docs/operations.md](/home/simon/keylore/docs/operations.md)
- [docs/threat-model.md](/home/simon/keylore/docs/threat-model.md)
- [docs/keylore-spec-map.md](/home/simon/keylore/docs/keylore-spec-map.md)
- [docs/roadmap.md](/home/simon/keylore/docs/roadmap.md)
- [SECURITY.md](/home/simon/keylore/SECURITY.md)

## Development

```bash
npm run typecheck
npm test
npm run build
```

## License

Licensed under Apache-2.0. See [LICENSE](/home/simon/keylore/LICENSE) and [NOTICE](/home/simon/keylore/NOTICE).
