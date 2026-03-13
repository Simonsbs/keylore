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
- policy simulation and non-executing dry-run access evaluation
- auth-client lifecycle APIs with secret rotation and status control
- token listing and explicit token revocation APIs
- pluggable secret adapters for environment bindings, Vault, 1Password, AWS Secrets Manager, and GCP Secret Manager
- catalog reporting for rotation and expiry visibility
- sandboxed injection mode for tightly allowlisted compatibility commands
- constrained proxy execution for `http.get` and `http.post`
- HTTP admin/API surface for catalogue search, access requests, approvals, audit reads, adapter health, runtime injection, and auth-client inspection
- local admin CLI for catalogue, reporting, access evaluation, runtime injection, approvals, auth-client, maintenance, and backup operations
- request-size limits, database-backed rate limiting, background maintenance cleanup, outbound timeouts, and response-size caps
- Prometheus-style `/metrics` telemetry and request correlation headers for operational visibility

## What is intentionally deferred

The full `KeyLore.md` specification is broader than a sane v0.5 delivery. This repo does not yet implement:

- multi-tenant isolation, delegated approvals, and break-glass workflows
- admin UI and rotation orchestration

Those items are tracked in [docs/roadmap.md](/home/simon/keylore/docs/roadmap.md) and mapped back to the spec in [docs/keylore-spec-map.md](/home/simon/keylore/docs/keylore-spec-map.md).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and populate the demo secret refs, bootstrap client secrets, and any provider-specific adapter settings you intend to use:

```bash
KEYLORE_SECRET_GITHUB_READONLY=...
KEYLORE_SECRET_NPM_READONLY=...
KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET=...
KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET=...
KEYLORE_SANDBOX_INJECTION_ENABLED=true
KEYLORE_SANDBOX_COMMAND_ALLOWLIST=/usr/bin/env,node
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
  -d 'grant_type=client_credentials&client_id=keylore-admin-local&client_secret=REPLACE_ME&scope=catalog:read%20broker:use%20approval:read%20approval:review%20audit:read%20admin:read%20admin:write%20sandbox:run&resource=http://127.0.0.1:8787/v1'
```

8. Verify the health endpoint:

```bash
curl http://127.0.0.1:8787/healthz
```

9. Inspect metrics and maintenance status:

```bash
curl http://127.0.0.1:8787/metrics
npm run dev:cli -- system maintenance
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

Simulate an access request without executing it:

```bash
TOKEN=...
curl -X POST http://127.0.0.1:8787/v1/access/simulate \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "credentialId":"github-readonly-demo",
    "operation":"http.get",
    "targetUrl":"https://api.github.com/repos/modelcontextprotocol/specification"
  }'
```

Read rotation and expiry status:

```bash
TOKEN=...
curl http://127.0.0.1:8787/v1/catalog/reports \
  -H "authorization: Bearer ${TOKEN}"
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

Run a tightly allowlisted injected command:

```bash
TOKEN=...
curl -X POST http://127.0.0.1:8787/v1/runtime/sandbox \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{
    "credentialId":"github-readonly-demo",
    "command":"node",
    "args":["-e","console.log(process.env.GITHUB_TOKEN)"]
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

Simulate a request locally:

```bash
npm run dev:cli -- access simulate --file ./request.json
```

Inspect rotation status locally:

```bash
npm run dev:cli -- catalog report
```

Create a logical backup locally:

```bash
npm run dev:cli -- system backup create --file ./keylore-backup.json
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
