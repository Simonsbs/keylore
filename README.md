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
- environment-backed secret adapter
- constrained proxy execution for `http.get` and `http.post`
- append-only NDJSON audit log
- HTTP admin/API surface for catalogue search, access requests, and audit reads

## What is intentionally deferred

The full `KeyLore.md` specification is broader than a sane v0.1 delivery. This repo does not yet implement:

- OAuth 2.1 authorization server flows for remote MCP
- secret-store adapters beyond environment variables
- sandboxed injection mode
- multi-tenant RBAC, approvals, and break-glass workflows
- admin UI and rotation orchestration

Those items are tracked in [docs/roadmap.md](/home/simon/keylore/docs/roadmap.md) and mapped back to the spec in [docs/keylore-spec-map.md](/home/simon/keylore/docs/keylore-spec-map.md).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and populate the demo secret refs:

```bash
KEYLORE_SECRET_GITHUB_READONLY=...
KEYLORE_SECRET_NPM_READONLY=...
```

3. Start the HTTP server:

```bash
npm run dev:http
```

4. Or run KeyLore as a local stdio MCP server:

```bash
npm run dev:stdio
```

5. Verify the health endpoint:

```bash
curl http://127.0.0.1:8787/healthz
```

## Example API usage

Search the catalogue:

```bash
curl -X POST http://127.0.0.1:8787/v1/catalog/search \
  -H 'content-type: application/json' \
  -d '{"query":"github","limit":5}'
```

Request a proxy call:

```bash
curl -X POST http://127.0.0.1:8787/v1/access/request \
  -H 'content-type: application/json' \
  -d '{
    "credentialId":"github-readonly-demo",
    "operation":"http.get",
    "targetUrl":"https://api.github.com/repos/modelcontextprotocol/specification"
  }'
```

## Example Codex configuration

See [examples/codex/config.toml](/home/simon/keylore/examples/codex/config.toml) for both `stdio` and remote HTTP MCP registration examples.

## Documentation

- [docs/architecture.md](/home/simon/keylore/docs/architecture.md)
- [docs/api.md](/home/simon/keylore/docs/api.md)
- [docs/configuration.md](/home/simon/keylore/docs/configuration.md)
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
