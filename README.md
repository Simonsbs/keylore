# KeyLore

KeyLore is a credential broker and searchable credential catalogue for MCP clients such as Codex CLI, Claude Code, and other Model Context Protocol toolchains.

The design goal comes directly from the local `KeyLore.md` production spec used to bootstrap this repository: let agents discover and use the right credential metadata without ever putting secret values into model context, prompts, logs, or tool results.

## Status

This repository is incubating privately today, but it is structured to be published as open source without a cleanup pass. The repo already includes:

- an Apache-2.0 project license and `NOTICE`
- contributor and security policies
- CI, container packaging, and deployment examples
- architecture, API, threat model, and roadmap docs
- conformance and tenant-operations guides
- compatibility contract and release-hardening guides
- admin UI guide
- release checklist

## What is implemented now

- MCP server for `stdio` and Streamable HTTP
- metadata-only catalogue search and retrieval tools
- default-deny policy engine with domain and operation constraints
- file-backed local persistence by default with startup migrations, plus explicit PostgreSQL support for advanced deployments
- OAuth-style client credentials token issuance for remote HTTP and MCP access
- PKCE-bound `authorization_code` plus rotating `refresh_token` support for interactive public or confidential clients
- protected-resource metadata for REST and MCP surfaces
- identity-aware policy evaluation with role-aware rule matching
- approval-required policy outcomes with review endpoints and CLI support
- multi-review approval and break-glass quorums with duplicate-review protection
- RBAC separation for admin, auth admin, operator, maintenance, backup, break-glass, auditor, approver, and consumer clients
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
- audited break-glass request, approval, revoke, and emergency-use flow
- delegated backup export, inspect, and restore API endpoints for self-hosted operators
- egress policy blocks private, loopback, and link-local upstream targets unless explicitly allowed
- sandbox env allowlisting for injected runtime execution
- signed notification webhooks for approval and break-glass lifecycle events
- request trace capture with `x-trace-id` propagation and recent-trace inspection
- optional external trace export with operator status and manual flush controls
- `private_key_jwt` OAuth client authentication with assertion replay protection
- persisted credential rotation workflows with plan, start, complete, and fail transitions
- tenant-aware partitioning for credentials, policies, auth clients, approvals, break-glass, audit events, tokens, rotation runs, and logical backups
- first-class tenant registry with tenant bootstrap workflows for auth-client seeding
- tenant-scoped backup export and restore isolation for delegated tenant operators
- explicit conformance suite for auth, tenancy, and backup boundary regressions
- frozen `v1.0.0-rc1` compatibility contract for OAuth, REST, and MCP tool names
- dedicated hardening suite for replay, tenant-isolation, and delegated-admin abuse paths
- minimal admin UI for operator login, tenants, auth clients, reviews, backups, audit, and system status
- Helm chart with dev, staging, and production values profiles
- HA-oriented Helm profile with pod disruption budget and spread controls
- tagged release workflow with SBOM generation, vulnerability scanning, keyless image signing, and Helm upgrade validation
- shipped Grafana dashboard and Prometheus alert rule examples

## What is intentionally deferred

The full `KeyLore.md` specification is broader than a sane `v1.0.0-rc5` delivery. The main remaining work before `v1.0.0` is:

- public release polish and final operator documentation cleanup

Those items are tracked in [docs/roadmap.md](/home/simon/keylore/docs/roadmap.md) and mapped back to the spec in [docs/keylore-spec-map.md](/home/simon/keylore/docs/keylore-spec-map.md).

The active post-`v1.0.0-rc5` refocus is documented in [docs/core-mode-plan.md](/home/simon/keylore/docs/core-mode-plan.md): make the default user journey "add secret, add context, connect MCP, use it" and push broader operator features behind an advanced path.

The handoff from local core mode to advanced self-hosted mode is documented in [docs/production-handoff.md](/home/simon/keylore/docs/production-handoff.md).

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Start the zero-config local stack:

```bash
npm run quickstart
```

That starts KeyLore in the background. Use `keylore-http status`, `keylore-http stop`, and `keylore-http restart` to manage it later. Use `keylore-http run` only when you intentionally want the server attached to the terminal for debugging.

For a clean Linux VM install from npm instead of cloning the repo:

```bash
npm install -g @simonsbs/keylore@next
keylore-http start
```

That starts KeyLore from the packaged migrations and seed data with no Docker or external PostgreSQL required. Writable state defaults to `~/.keylore`.

To simulate a brand-new user install on the same machine without reusing your normal checkout or shell environment:

```bash
npm run ops:fresh-user-env
```

That launches an isolated disposable user, a fresh clone, and a separate KeyLore UI port for onboarding and MCP testing. By default it clones from the current local repo source so it also works while the repo is private.

This boots KeyLore at `http://127.0.0.1:8787` with a local embedded database and encrypted local secret store.
If KeyLore is already running locally, the command reuses the existing background instance instead of failing.

3. Open KeyLore in your browser:

`http://127.0.0.1:8787/`

KeyLore now redirects `/` to `/admin` and automatically opens a local operator session on loopback development installs.

If that local session bootstrap fails for any reason, use `Start working locally` or the manual sign-in form shown on the page.

4. In `Save token`, choose the closest template for the token you are adding, such as `GitHub read-only`, `GitHub write-capable`, `npm read-only`, or `Internal service token`, then fill in:
- `Name shown in KeyLore`
- `Token key`
- `Paste token`
- `Where can it be used?`
- `Tell the AI when to use this token`

That stores the raw token outside the searchable catalogue and keeps only the LLM-facing metadata in the credential record.

5. Review `Writing help` and `What the AI will see` in the form to confirm the agent-facing record is specific, useful, and secret-free. `Token key` is the unique identifier for the token; if KeyLore says a token already exists, change that field and save again. Open `Advanced token settings` only if you need to change storage mode, risk level, service name, tags, or write access.

6. In `Saved tokens`, look under `Your tokens` for the ones you added yourself. `Included examples` are seeded local records and are shown separately so they do not get confused with your own tokens.

7. In `Test credential`, choose `Token to check`, set the `URL to call with this token`, and run the check.

The check makes a real brokered `http.get` call with that token and URL. Success means the token, the target domain, and KeyLore policy all allowed the request.

8. In `Connect your AI tool`, copy the generated Codex or Gemini CLI local snippet for the easiest setup. Use the built-in `First prompt to try` examples after you restart the client. If you want remote HTTP MCP instead, open `Remote or advanced connection options` and mint an `/mcp` token there.

Everything beyond that now sits behind `Show advanced controls` in the UI, so a first-run user can ignore tenants, OAuth client administration, approvals, backups, audit, and system internals entirely.

After creation, use `Inspect or edit AI-facing context` inside `Save token` if you need to refine the metadata without re-entering or exposing the stored secret. Saved token cards also support lightweight lifecycle actions such as rename, retag, and archive/restore under `More actions`.

When that local path stops being enough, use [docs/production-handoff.md](/home/simon/keylore/docs/production-handoff.md) to decide when to switch to external secret backends, real OAuth clients, approvals, and tenant-separated self-hosting.

## Optional local overrides

If you want to override the local defaults, create `.env` from [.env.example](/home/simon/keylore/.env.example). KeyLore now auto-loads `.env` on startup, so you do not need to `source` it manually.

If you override `KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET`, the local admin quickstart button is no longer shown in the UI. At that point you are expected to sign in with your configured client credentials.

Common overrides:

```bash
cp .env.example .env
```

```bash
KEYLORE_SECRET_GITHUB_READONLY=...
KEYLORE_SECRET_NPM_READONLY=...
KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET=...
KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET=...
KEYLORE_SANDBOX_INJECTION_ENABLED=true
KEYLORE_SANDBOX_COMMAND_ALLOWLIST=/usr/bin/env,node
```

## Advanced local usage

If you want production-style external persistence locally, start PostgreSQL first:

```bash
npm run db:up
```

Then either set `KEYLORE_DATABASE_MODE=postgres` and `KEYLORE_DATABASE_URL=...` in `.env`, or export them for one run.

Start the HTTP server directly:

```bash
npm run dev:http
```

Or run KeyLore as a local stdio MCP server:

```bash
npm run dev:stdio
```

Use the local CLI:

```bash
npm run dev:cli -- catalog list
```

Mint an access token for the REST API:

```bash
curl -X POST http://127.0.0.1:8787/oauth/token \
  -H 'content-type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=keylore-admin-local&client_secret=REPLACE_ME&scope=catalog:read%20broker:use%20approval:read%20approval:review%20audit:read%20auth:read%20auth:write%20system:read%20system:write%20backup:read%20backup:write%20breakglass:request%20breakglass:read%20breakglass:review%20sandbox:run&resource=http://127.0.0.1:8787/v1'
```

Remote tokens are tenant-scoped through their OAuth client. A tenant-bound caller only sees and mutates records from its own tenant; the local CLI continues to run as a global operator.

Interactive flows can mint a user-bound code with `POST /oauth/authorize`, then exchange it at `POST /oauth/token` with `grant_type=authorization_code` and PKCE.

Verify the health endpoint:

```bash
curl http://127.0.0.1:8787/healthz
```

Inspect metrics and maintenance status:

```bash
curl http://127.0.0.1:8787/metrics
npm run dev:cli -- system maintenance
npm run dev:cli -- system traces --limit 10
npm run dev:cli -- system trace-exporter
npm run dev:cli -- system rotations list
```

Validate the Helm deployment path:

```bash
npm run ops:helm-validate
```

Run the release candidate gates:

```bash
npm run ops:release-verify
```

Open the admin UI in a browser at `http://127.0.0.1:8787/admin`.

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

Inspect recent traces for a propagated request trace id:

```bash
TOKEN=...
curl "http://127.0.0.1:8787/v1/system/traces?traceId=deploy-trace-123&limit=10" \
  -H "authorization: Bearer ${TOKEN}"
```

Inspect the external trace-export pipeline:

```bash
TOKEN=...
curl http://127.0.0.1:8787/v1/system/trace-exporter \
  -H "authorization: Bearer ${TOKEN}"
curl -X POST http://127.0.0.1:8787/v1/system/trace-exporter/flush \
  -H "authorization: Bearer ${TOKEN}"
```

Bootstrap a tenant and interactive client seed set:

```bash
npm run dev:cli -- tenants bootstrap --file ./tenant-bootstrap.json
```

Plan rotation runs:

```bash
TOKEN=...
curl -X POST http://127.0.0.1:8787/v1/system/rotations/plan \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"horizonDays":14}'
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

Inspect trace-export status:

```bash
npm run dev:cli -- system trace-exporter
npm run dev:cli -- system trace-exporter flush
```

Work rotation runs:

```bash
npm run dev:cli -- system rotations list
npm run dev:cli -- system rotations plan --horizon-days 14
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

Run the restore drill locally:

```bash
KEYLORE_DATABASE_URL=postgresql://... \
KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET=... \
KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET=... \
npm run ops:restore-drill
```

Validate Helm render and dry-run upgrade paths:

```bash
npm run ops:helm-validate
```

## Documentation

- [docs/architecture.md](/home/simon/keylore/docs/architecture.md)
- [docs/api.md](/home/simon/keylore/docs/api.md)
- [docs/deployment.md](/home/simon/keylore/docs/deployment.md)
- [docs/configuration.md](/home/simon/keylore/docs/configuration.md)
- [docs/cli.md](/home/simon/keylore/docs/cli.md)
- [docs/observability.md](/home/simon/keylore/docs/observability.md)
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
