# Admin UI

KeyLore now ships a minimal operator UI at `/admin`.

## Scope

The UI is intentionally narrow and stays on top of the frozen REST contract:

- create credentials through a simplified `save token -> test token -> connect AI tool` flow
- preview the exact MCP-visible credential metadata before saving
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
2. Open `<publicBaseUrl>/`.
3. KeyLore redirects `/` to `/admin` and automatically opens a local operator session on loopback development installs.
4. If that local bootstrap fails, use `Start working locally` or the manual sign-in form.
5. Use `Token management` for the beginner path:
   - click `Add token`
   - choose a template
   - name the token
   - set the `Token key`
   - paste the token
   - explain the token for people
   - say when the AI should use it
6. Start from a stronger template when possible:
   - `GitHub read-only`
   - `GitHub write-capable`
   - `npm read-only`
   - `Internal service token`
   - `Generic bearer API`
7. Review `What the AI will see` to confirm the MCP-visible record is useful and contains no secret material.
8. `Explain this token for people` is for human operators. `Tell the AI when to use this token` is the primary retrieval hint for the agent.
9. Use `Writing help` plus the inline validation messages to improve weak or overly generic `LLM context` before save.
10. `Token key` is the unique identifier for the token. If the UI says a token already exists, change that field and save again.
11. Open `Advanced token settings` only if you need to change storage mode, risk level, service name, tags, or write access.
12. In `Saved tokens`, everything is listed together. Example records are marked as examples and can be edited or deleted from the same list.
13. Use `Test credential` to run a brokered HTTP call such as `https://api.github.com/rate_limit`.
14. The test is a real `http.get` with the selected token and URL. Success means the token, target domain, and KeyLore policy all allowed the request.
15. Use `Connect your AI tool` to copy the generated local snippets for Codex and Gemini CLI.
16. Use the built-in `First prompt to try` examples after restarting the MCP client.
17. Open `Remote or advanced connection options` only if you need HTTP MCP.
18. Ignore the rest unless you need it. The tenant, auth, review, backup, audit, and system panels stay behind `Show advanced controls`.
19. Otherwise use an existing operator OAuth client or paste an already minted bearer token.

## Context editing

Inside `Token management`, use `Edit token` from any row to:

- inspect the current MCP-visible record for a saved credential
- update display name, service, sensitivity, domains, tags, operations, `User context`, and `LLM context`
- archive, restore, or delete the token directly from the row actions
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
- Automatic local session bootstrap is only available on loopback development instances. Production-style deployments and non-loopback access still need real operator credentials.
- If the active token lacks scopes or roles for a panel, that panel renders the underlying API error instead of bypassing authorization.
- Tenant-scoped backup and auth-admin restrictions remain enforced server-side.
