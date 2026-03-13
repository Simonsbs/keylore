# KeyLore Spec Map

This file maps the current repository state to the local `KeyLore.md` production spec used to bootstrap the repository.

## Implemented now

- metadata-only catalogue search
- metadata lookup by credential ID
- adapter-based secret resolution
- default-deny policy evaluation
- proxy mode execution for constrained HTTP calls
- MCP server support for `stdio` and Streamable HTTP
- audit event generation for search, read, write, authz, and use
- container packaging and CI basics

## Partially implemented

- Catalogue CRUD: REST implemented, no UI yet
- Remote MCP auth: bearer-token gate exists, OAuth 2.1 remains open
- Deployment readiness: Docker is present, Helm/Kubernetes artifacts are not

## Deferred

- injection mode
- multi-tenant isolation
- approval workflows
- break-glass flow
- rotation orchestration
- admin UI and CLI richness
- managed gateway profiles beyond static examples

## Rationale

`KeyLore.md` is a production specification. Shipping a narrowly secure broker path first is materially better than scaffolding every enterprise feature without a reliable core.
