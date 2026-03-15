# Roadmap

## Product direction

KeyLore's root goal is credential brokering for LLM coding tools:

- store the real secret in a secret backend
- store separate LLM-friendly context that references the secret by credential id
- let the agent discover the context, not the secret
- let the broker use the secret on the agent's behalf

The active follow-on plan after `v1.0.0` is documented in [docs/core-mode-plan.md](/home/simon/keylore/docs/core-mode-plan.md). That plan keeps zero-config local use as the default path and treats the broader operator platform as advanced scope.

## v0.3

- completed:
- PostgreSQL-backed persistence and migrations
- explicit output schemas for MCP tools
- request-size, rate-limit, timeout, and response-size controls
- admin CLI for catalogue and audit operations
- OAuth-style client credentials issuance and protected-resource metadata
- resource-bound bearer token validation for REST and MCP
- identity-aware policy evaluation with principal roles
- approval-required policy outcomes with review workflow
- RBAC separation for admin, operator, auditor, approver, and consumer
- expanded CLI for approvals and auth-client visibility
- add policy simulation endpoint and dry-run mode
- add explicit token revocation and client lifecycle management APIs

## v0.4

- completed:
- add sandboxed injection mode for tightly controlled compatibility cases
- add adapter plugins for Vault, 1Password, AWS Secrets Manager, and GCP Secret Manager
- add rotation and expiry reporting

## v0.5

- completed:
- add Prometheus-style metrics and request correlation for HTTP operations
- move rate limiting to PostgreSQL-backed shared state
- add background maintenance for stale approvals, expired tokens, and rate-limit bucket cleanup
- add logical backup and restore tooling for self-hosted recovery
- harden adapter behavior with retries and circuit breaking

## v0.6

- completed:
- add Helm chart and environment-specific deployment values
- add tagged-release workflow with image build, SBOM generation, scanning, and signing
- add shipped Grafana dashboard and Prometheus alert rules
- add deployment and restore-drill documentation plus CLI restore coverage

## v0.7

- completed:
- add specialized RBAC for auth administration, maintenance, backup, and break-glass operations
- add audited break-glass request, approval, denial, revoke, and emergency-use flow
- harden egress policy with blocked private/link-local targets and HTTPS port allowlisting
- harden sandbox env injection with reserved-name protection and explicit env allowlisting
- add backup export, inspect, and restore API endpoints for delegated self-hosted operations
- expand abuse-case coverage for egress, sandbox, break-glass, and delegated operator roles

## v0.8

- completed:
- add quorum-based approval and break-glass review workflows with duplicate-review protection
- add signed notification webhooks for approval and break-glass lifecycle events
- add in-memory recent trace capture with `x-trace-id` propagation across HTTP and notification flows
- add REST, CLI, and MCP trace inspection surfaces for operators
- add Helm lint, render, and dry-run upgrade validation to CI and release flows
- add operator guidance for Helm upgrade validation and rollback planning

## v0.9

- completed:
- add `private_key_jwt` OAuth client authentication with persisted assertion replay protection
- add external trace export with queue status, manual flush, and operator inspection
- add persisted rotation orchestration with plan, start, complete, and fail transitions
- add HA-oriented Helm profile with pod disruption budget and topology spread controls
- expand backup coverage and tests for auth-client and rotation state

## v0.10

- completed:
- add tenant-aware partitioning for credentials, policies, auth clients, approvals, break-glass, audit events, access tokens, and rotation runs
- bind remote bearer tokens to a tenant and enforce tenant boundaries across REST, CLI, and MCP reads
- block cross-tenant credential and auth-client writes for tenant-scoped remote actors
- preserve tenant identity in logical backup export and restore flows
- add end-to-end tenant-isolation coverage for auth-client visibility, catalog reads, and write rejection paths

## v0.11

- completed:
- add `authorization_code` plus rotating `refresh_token` support with PKCE for public and confidential clients
- add public OAuth client mode with `tokenEndpointAuthMethod: none`
- add refresh-token inspection and revocation APIs for operators
- add first-class tenant records plus tenant bootstrap, list, read, and update operations
- add bootstrap import support for tenant records derived from seeded catalog, policy, and auth-client data
- expand integration coverage for interactive OAuth flows and tenant bootstrap operations

## v0.12

- completed:
- add explicit conformance suite and CI gate for auth, tenancy, and backup-boundary regressions
- harden tenant-scoped backup export and restore so tenant operators cannot read or overwrite foreign tenant data
- add regression coverage for disabled tenants, public-client grant misuse, and tenant-scoped backup restore rejection
- add operator docs for tenant lifecycle, interactive auth setup, conformance, and tenant-safe recovery

## v1.0-rc1

- completed:
- freeze the public OAuth, REST, and MCP compatibility contract
- add dedicated contract and hardening suites to CI and release promotion
- reject authorization-code replay and rotated refresh-token replay in release-blocking coverage
- harden delegated auth administration so tenant-scoped token revocation checks happen before mutation

## v1.0-beta

- completed:
- add a server-hosted minimal admin UI at `/admin`
- keep the UI on top of the frozen REST contract without adding backend surface area
- cover the UI route with focused HTTP regression coverage
- expose tenant, auth-client, approval, break-glass, backup, audit, and system panels for operators

## v1.0-rc3

- completed:
- add a live container smoke path for `/admin`, health, and token-backed operator access
- tighten install, upgrade, rollback, and recovery documentation for the final release path
- add an explicit release checklist for final promotion

## v1.0

- completed:
- add one-command sequential release verification via `ops:release-verify`
- align release automation and operator docs to the same final rehearsal path

## v1.0

- finalize public release polish and operator-facing documentation

## v1.1

- active:
- refocus the product around `core` mode:
  - completed:
    - zero-config local startup
    - secret onboarding
    - brokered test flow
    - Codex/Gemini MCP connection flow
    - hide the broader platform behind `advanced` mode by default
  - next:
    - LLM-friendly context authoring
    - context preview and stronger authoring templates
