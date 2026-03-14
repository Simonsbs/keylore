# Admin UI

KeyLore now ships a minimal operator UI at `/admin`.

## Scope

The UI is intentionally narrow and stays on top of the frozen REST contract:

- create credentials through the new core onboarding flow
- preview the exact MCP-visible credential metadata before saving
- test credentials through brokered access from the UI
- generate Codex and Gemini CLI MCP connection snippets
- mint and verify a remote HTTP MCP token from the UI
- open an operator session with `client_credentials` or a pasted bearer token
- keep the broader operator controls behind an explicit `Advanced` toggle:
  - inspect readiness and recent operator responses
  - create and toggle tenants
  - create, enable, disable, and rotate OAuth clients
  - review approval and break-glass queues
  - inspect recent audit events
  - export, inspect, and restore logical backups
  - inspect maintenance, adapters, traces, trace exporter status, and rotation runs

## Non-goals

This UI does not introduce new backend endpoints or change the existing auth model.

- it does not display secret values from credentials
- it does not replace the CLI for automation-heavy workflows
- it does not weaken tenant or scope boundaries

## Usage

1. For local use, run `npm run quickstart`.
2. Open `<publicBaseUrl>/admin`.
3. On the local loopback quickstart path, click `Use local admin quickstart`.
4. Use `Credentials` to create a token-backed credential with either:
   - `Local encrypted store`
   - `Environment reference`
5. Review `MCP-visible metadata preview` to confirm the agent-facing record is useful and contains no secret material.
6. Use `Test Credential` to run a brokered HTTP call such as `https://api.github.com/rate_limit`.
7. Use `Connect MCP` to copy the generated `stdio` or HTTP snippets for Codex and Gemini CLI.
8. Ignore the rest unless you need it. The tenant, auth, review, backup, audit, and system panels stay behind `Show advanced controls`.
9. Otherwise use an existing operator OAuth client or paste an already minted bearer token.

## Validation

Use the shipped container smoke path to confirm the UI is reachable through the built image:

```bash
npm run ops:container-smoke
```

For the full release rehearsal, use:

```bash
npm run ops:release-verify
```

## Operator notes

- The page itself is public, but every data read and action still goes through the existing authenticated REST endpoints.
- The local quickstart shortcut is only exposed on loopback development instances that are still using the built-in local bootstrap secret. Production-style deployments and overridden local secrets still need real operator credentials.
- If the active token lacks scopes or roles for a panel, that panel renders the underlying API error instead of bypassing authorization.
- Tenant-scoped backup and auth-admin restrictions remain enforced server-side.
