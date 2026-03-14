# Production Handoff

This guide explains when to stay in local `core` mode and when to move to `advanced` self-hosted mode.

## Core mode

Use core mode when all of the following are true:

- you are a single user or a very small local team
- the instance runs on your own machine or a tightly controlled loopback-only environment
- you need the shortest path to:
  - add a secret
  - add LLM-facing context
  - test the credential
  - connect Codex or Gemini CLI
- you do not need separate human identities, approvals, or tenant isolation yet

Core mode is the right default for:

- local coding workflows
- personal automation
- early internal evaluation
- proving that the brokered secret flow works before operationalizing it

## Advanced mode

Switch to advanced mode when any of the following becomes true:

- more than one person depends on the same deployment
- the service is reachable beyond local loopback
- you need separate operator, approver, auditor, or tenant roles
- you need external secret backends such as Vault or cloud secret managers
- you need approval workflows, break-glass review, or delegated auth administration
- you need backup, restore, audit, Helm deployment, or release controls as part of normal operations

Advanced mode is the right shape for:

- internal team deployments
- persistent self-hosted environments
- regulated or audited workflows
- tenant-separated or customer-facing deployments

## What changes between modes

### Secret storage

Core mode:

- optimized for the local encrypted store
- simplest way to get a token into KeyLore quickly
- lowest friction for local testing

Advanced mode:

- move secret material to Vault or supported cloud backends when possible
- keep local secret storage only for development or tightly bounded operator use
- use provider-native access controls, rotation, and audit where available

### Authentication

Core mode:

- local quickstart path is acceptable on loopback development instances
- a single local operator session is the expected shape

Advanced mode:

- use real OAuth clients
- separate operator identities and scopes
- disable reliance on the local quickstart shortcut

### Authorization and review

Core mode:

- the main value is brokered secret use without exposing the raw token
- approvals, break-glass, and delegated operator roles can remain ignored

Advanced mode:

- enable approvals for sensitive actions
- use break-glass only as an audited exception path
- separate admin, auth-admin, auditor, approver, backup, and maintenance responsibilities

### Tenancy

Core mode:

- a single-user or single-tenant mental model is enough

Advanced mode:

- use tenant-aware auth clients and records
- treat tenant boundaries as part of the production security model
- validate backup and restore procedures with tenant isolation in mind

### Operations

Core mode:

- `npm run quickstart`
- browser-based setup
- local MCP connection

Advanced mode:

- PostgreSQL as the durable system of record
- Helm or container deployment
- backup and restore drills
- release verification, metrics, and audit review

## Practical migration path

The intended path is incremental, not disruptive:

1. Start in local core mode.
2. Add credentials and LLM-facing context.
3. Prove the MCP workflow with Codex or Gemini CLI.
4. Move secret bindings to Vault or cloud secret managers when local storage is no longer enough.
5. Switch from local quickstart to real OAuth clients.
6. Enable advanced review and operator controls only when the team or risk level requires them.
7. Move to Helm or another durable self-hosted deployment model once the workflow becomes shared infrastructure.

## Recommended rule of thumb

Use core mode until people, exposure, or compliance requirements force you out of it.

Do not move to advanced mode just because the features exist. Move when you need:

- shared operation
- stronger identity separation
- stronger secret-store guarantees
- stronger audit and recovery guarantees

## Related docs

- [README.md](/home/simon/keylore/README.md)
- [docs/core-mode-plan.md](/home/simon/keylore/docs/core-mode-plan.md)
- [docs/configuration.md](/home/simon/keylore/docs/configuration.md)
- [docs/operations.md](/home/simon/keylore/docs/operations.md)
- [docs/deployment.md](/home/simon/keylore/docs/deployment.md)
