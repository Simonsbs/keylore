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
- PKCE-bound authorization-code and refresh-token flows for interactive clients
- resource-bound token validation and scope enforcement
- approval-required policy rules with persisted approval requests
- policy simulation and non-executing dry-run evaluation
- auth-client lifecycle management and token revocation
- sandbox injection mode with allowlisted commands and output scrubbing
- adapter plugins for Vault, 1Password, AWS Secrets Manager, and GCP Secret Manager
- rotation and expiry reporting through adapter inspection and catalog reports
- RBAC-aware policy matching and endpoint authorization
- Prometheus-style metrics and request correlation headers
- database-backed shared rate limiting
- background maintenance for approval/token expiry and rate-limit cleanup
- logical backup and restore tooling for self-hosted recovery
- Helm chart with deployment profiles for dev, staging, and production
- tagged release workflow with SBOM generation, scanning, and signing
- shipped observability artifacts for dashboards and alert rules
- break-glass workflow with persisted requests and audited activation/revocation
- quorum-based approval and break-glass reviews with persisted review history
- signed notification webhooks for approval and break-glass lifecycle events
- recent trace capture with operator inspection over REST, CLI, and MCP
- external trace export with queue inspection and manual flush
- delegated auth, maintenance, and backup administration roles
- egress policy enforcement for blocked private and link-local targets
- sandbox env allowlisting and reserved-name protection
- container packaging and CI basics
- startup migrations, config validation, and bootstrap import
- ingress and egress hardening controls
- Helm dry-run upgrade validation in CI and release automation
- `private_key_jwt` OAuth client authentication with persisted replay protection
- public OAuth client support with `tokenEndpointAuthMethod: none`
- rotation orchestration with persisted runs and operator lifecycle controls
- HA-oriented Helm values with pod disruption budget and spread constraints
- tenant-aware partitioning across catalog, policy, auth, approval, break-glass, audit, token, rotation, and backup data
- tenant registry plus tenant bootstrap, list, read, and update operations
- explicit conformance suite for OAuth metadata, tenant disablement, and tenant-scoped backup boundaries
- tenant-scoped backup export and restore isolation

## Partially implemented

- Catalogue CRUD: REST and CLI implemented, no UI yet
- Deployment readiness: Helm and release automation are present, but no operator-managed multi-cluster story exists yet
- Observability: metrics, recent traces, trace export, dashboards, and alert rules are present, but no vendor-specific tracing stack is bundled yet
- Multi-tenant operations: tenant registry and bootstrap automation now exist, but there is still no tenant admin UI

## Deferred

- admin UI and CLI richness
- managed gateway profiles beyond static examples

## Rationale

`KeyLore.md` is a production specification. Shipping a narrowly secure broker path first is materially better than scaffolding every enterprise feature without a reliable core.
