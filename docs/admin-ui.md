# Admin UI

KeyLore now ships a minimal operator UI at `/admin`.

## Scope

The UI is intentionally narrow and stays on top of the frozen REST contract:

- open an operator session with `client_credentials` or a pasted bearer token
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

1. Start the HTTP server.
2. Open `<publicBaseUrl>/admin`.
3. Use an existing operator OAuth client or paste an already minted bearer token.
4. Work through the tenant, auth, review, backup, audit, and system panels.

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
- If the active token lacks scopes or roles for a panel, that panel renders the underlying API error instead of bypassing authorization.
- Tenant-scoped backup and auth-admin restrictions remain enforced server-side.
