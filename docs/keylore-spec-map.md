# KeyLore Spec Map

This file maps the current repository state to the local `KeyLore.md` production spec used to bootstrap the repository.

## Implemented now

- metadata-only catalogue search
- metadata lookup by credential ID
- adapter-based secret resolution
- default-deny policy evaluation
- proxy mode execution for constrained HTTP calls
- MCP server support for `stdio` and Streamable HTTP
- audit event generation for search, read, write, authz, and use backed by PostgreSQL
- OAuth-style token issuance and protected-resource metadata for REST and MCP
- resource-bound token validation and scope enforcement
- approval-required policy rules with persisted approval requests
- RBAC-aware policy matching and endpoint authorization
- container packaging and CI basics
- startup migrations, config validation, and bootstrap import
- ingress and egress hardening controls

## Partially implemented

- Catalogue CRUD: REST and CLI implemented, no UI yet
- Remote MCP auth: client credentials and protected-resource metadata exist, but no broader OAuth authorization flows
- Deployment readiness: Docker is present, Helm/Kubernetes artifacts are not
- Approval operations: CLI and API exist, but no delegated multi-party workflow or notification layer yet

## Deferred

- injection mode
- multi-tenant isolation
- break-glass flow
- rotation orchestration
- admin UI and CLI richness
- managed gateway profiles beyond static examples

## Rationale

`KeyLore.md` is a production specification. Shipping a narrowly secure broker path first is materially better than scaffolding every enterprise feature without a reliable core.
