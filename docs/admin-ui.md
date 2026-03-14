# Admin UI

KeyLore now ships a minimal operator UI at `/admin`.

## Scope

The UI is intentionally narrow and stays on top of the frozen REST contract:

- create credentials through a simplified `save token -> test token -> connect AI tool` flow
- preview the exact AI-visible credential metadata before saving
- get template-specific context guidance and inline validation before saving
- inspect and update MCP-visible context after creation without touching the stored secret
- test credentials through brokered access from the UI
- get built-in first-prompt examples for Codex and Gemini after MCP setup
- generate Codex and Gemini CLI MCP connection snippets
- mint and verify a remote HTTP MCP token from the UI
- open an operator session with one-click local quickstart or with `client_credentials` / a pasted bearer token
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
4. Use `Save token` for the beginner path:
   - choose a template
   - name the token
   - paste the token
   - say when the AI should use it
5. Start from a stronger template when possible:
   - `GitHub read-only`
   - `GitHub write-capable`
   - `npm read-only`
   - `Internal service token`
   - `Generic bearer API`
6. Review `What the AI will see` to confirm the agent-facing record is useful and contains no secret material.
7. Use `Writing help` plus the inline validation messages to improve weak or overly generic `selectionNotes` before save.
8. Open `Advanced token settings` only if you need to change storage mode, internal ID, risk level, service name, tags, or write access.
9. Use `Test credential` to run a brokered HTTP call such as `https://api.github.com/rate_limit`.
10. Use `Connect your AI tool` to copy the generated local snippets for Codex and Gemini CLI.
11. Use the built-in `First prompt to try` examples after restarting the MCP client.
12. Open `Remote or advanced connection options` only if you need HTTP MCP.
13. Ignore the rest unless you need it. The tenant, auth, review, backup, audit, and system panels stay behind `Show advanced controls`.
14. Otherwise use an existing operator OAuth client or paste an already minted bearer token.

## Context editing

Inside `Save token`, use `Inspect or edit AI-facing context` to:

- inspect the current MCP-visible record for a saved credential
- update display name, service, sensitivity, domains, tags, operations, and `selectionNotes`
- apply lightweight lifecycle actions such as rename, retag, archive, and restore from `More actions`
- keep secret storage and binding details out of the edit path entirely

This flow is intentionally metadata-only. It does not display or mutate the stored secret.

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
