# Core Mode Plan

This document resets KeyLore around its root product goal:

1. the user stores a real secret in a secret store
2. the user stores separate LLM-facing context that references the secret by credential id
3. an MCP client such as Codex or Gemini CLI discovers the context, not the secret
4. KeyLore uses the secret on the agent's behalf through the broker
5. the raw secret never needs to enter model context, prompts, or tool output

Everything else is secondary unless it directly protects or enables that flow.

## Product modes

KeyLore should operate in two explicit modes:

- `core`
  - default after local install
  - single-user, loopback-first, no manual configuration required
  - optimized for "add secret, add context, connect MCP, use it"
- `advanced`
  - enabled explicitly for production-style self-hosting
  - exposes the current broader platform: OAuth client management, tenants, approvals, break-glass, backups, audit, Helm, and deployment controls

The current repo is advanced-mode heavy. Future work should make `core` the first-run experience and treat `advanced` as optional.

## User outcome

The first-run experience should become:

1. `npm install`
2. `npm run quickstart`
3. open `/admin`
4. click `Add credential`
5. choose a secret backend
6. paste or register a secret reference
7. write the LLM-facing usage context
8. click `Test credential`
9. copy the generated Codex or Gemini CLI MCP config
10. restart the CLI and use the credential through MCP

Anything beyond that is advanced scope.

## Core architecture

The core path should separate secret material from LLM-facing context.

### Secret store

The default local path should be:

1. OS keychain if available
2. encrypted local file fallback
3. existing advanced adapters remain available later

Core-mode storage requirements:

- secret values are never stored in the metadata catalogue
- the catalogue only stores `credentialId` plus the binding reference
- local import/export must never include raw secret material by default

### Context store

The context store should contain:

- `credentialId`
- display name
- service
- owner
- scope tier
- sensitivity
- allowed domains
- permitted operations
- tags
- selection notes written for LLM/tool selection
- runtime mode (`proxy` first, sandbox only when explicitly needed)

This is the data the LLM should search.

### Broker path

The core MCP path remains:

1. `catalog_search`
2. `catalog_get`
3. `access_request`

The broker should stay the only component that can resolve and use the secret.

## Roadmap

## Core-1

Zero-config local first run.

- `npm run quickstart` starts the app and opens the shortest path to use
- no manual `.env` export
- no mandatory token minting for the local UI
- loopback-only local admin session shortcut
- clearly separate local quickstart from production deployment guidance

Status:
- partially complete in `v1.0.0-rc5` and later local quickstart patches

## Core-2

First-class credential onboarding.

- add `Credentials` to the admin UI as the primary landing workflow
- create credentials directly in the UI
- support at least:
  - local key/value secret
  - environment reference
  - Vault reference
- validate allowed domains and operation mode during creation
- keep secret value entry separate from LLM-facing context entry in the UI

Acceptance criteria:

- a user can create a GitHub read-only credential without editing JSON
- the resulting record is searchable through MCP metadata tools

## Core-3

Local secret storage for real use.

- add a local secret adapter for single-user installs
- prefer OS keychain storage when supported
- add encrypted local file fallback when keychain is unavailable
- provide secret create, update, delete, and inspect flows in the UI
- never render the stored secret value back in the UI after save

Acceptance criteria:

- a user can paste a GitHub token into KeyLore without using `.env`
- the token persists across restart
- the catalogue stores only a reference to that stored secret

## Core-4

LLM-friendly context authoring.

- add a dedicated context editor to the UI
- make `selectionNotes` and allowed-domain guidance easier to write than raw JSON
- add preset templates for:
  - GitHub read-only
  - npm read-only
  - generic bearer API
- preview the MCP-visible metadata before saving

Acceptance criteria:

- a non-expert user can describe when the agent should use the credential
- the MCP-visible record is easy to inspect and clearly contains no secret value

Status:
- partially complete:
  - the core credential form now includes a live MCP-visible metadata preview
  - the preview shows the agent-facing record without binding refs or raw secret values
  - inline warnings now flag empty or weak selection notes and obvious secret-like content in notes
  - the core credential form now includes stronger templates for GitHub read-only, GitHub write-capable, npm read-only, and internal service tokens
  - templates now prefill the intended read or read/write operation profile instead of forcing every credential into `http.get`
  - template-specific guidance and submit-time validation now push users away from vague or secret-like `selectionNotes`
  - saved credentials can now be inspected and edited through a context-only flow without re-entering or exposing the stored secret
  - the UI now provides explicit next-step guidance, built-in first prompts for Codex and Gemini, and lightweight rename/retag/archive actions in core mode

## Core-5

Built-in broker test flow.

- add a `Test credential` action in the UI
- support a simple URL test for proxy mode
- show:
  - decision
  - matched rule if any
  - status code
  - redacted response preview
- make failure states obvious: secret missing, domain blocked, auth failed, bad token

Acceptance criteria:

- a user can verify a GitHub token against `https://api.github.com/rate_limit` without leaving the UI

Status:
- complete:
  - `Credentials` now includes a `Test Credential` panel that runs brokered `http.get` checks through the existing access-request path and shows the redacted result in the UI

## Core-6

MCP client connection flow.

- add a `Connect` panel to the UI
- generate copy-ready config for:
  - Codex
  - Gemini CLI
  - generic MCP HTTP client
- add a short connection test that confirms the MCP token or local connection works
- document the exact first prompt to try

Acceptance criteria:

- a user can connect Codex from the UI without reading the API docs
- the MCP path uses KeyLore tools and not the raw secret

Status:
- complete:
  - `Connect MCP` now generates ready-to-paste Codex and Gemini CLI snippets for local `stdio`
  - the panel also mints and verifies a resource-bound HTTP MCP token for `/mcp`

## Core-7

Hide advanced scope by default.

- move tenants, auth clients, approvals, break-glass, backups, audit, and system internals behind an `Advanced` section
- make the default landing page `Credentials`
- keep the existing APIs and advanced UI panels available, but out of the first-run path

Acceptance criteria:

- a new user can ignore advanced features entirely and still succeed with the core workflow

Status:
- complete:
  - the admin UI now exposes `Credentials` and `Connect MCP` as the default core navigation
  - the broader operator surface stays behind an explicit `Show advanced controls` toggle
  - session status remains visible in core mode without forcing the user into tenant, backup, audit, or system panels

## Core-8

Production handoff.

- make it obvious how to graduate from local core mode to advanced self-hosted mode
- document:
  - when to switch from local secret storage to Vault or cloud secret stores
  - when to enable OAuth, approvals, and multi-tenant separation
  - what security properties change between modes

Acceptance criteria:

- local-first users can start simple without being trapped in a dead-end mode

Status:
- complete:
  - added explicit production handoff guidance for the boundary between local `core` mode and `advanced` self-hosted mode
  - documented when to move from local secret storage to Vault or cloud secret stores
  - documented when to enable OAuth, approvals, and tenant separation
  - linked the handoff guidance from the main quickstart and operations docs

## Non-goals until the core path is excellent

The following should not take priority over the core flow:

- more approval complexity
- more tenant administration
- more break-glass features
- broader deployment topology
- more operator dashboards
- UI polish unrelated to credential onboarding or MCP usage

## Release gate for the refocus

The refocus is successful only when a new user can:

1. install KeyLore
2. launch it with one command
3. add a real token without editing code or JSON
4. add LLM-facing context separately from the token
5. test the token through the broker
6. connect Codex or Gemini CLI from generated config
7. use the credential through MCP
8. confirm the raw token never appears in model-visible output
