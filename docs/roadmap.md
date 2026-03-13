# Roadmap

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

## v1.0

- add multi-tenant RBAC and audit partitioning
- add admin UI
- add formal conformance and security hardening suites
