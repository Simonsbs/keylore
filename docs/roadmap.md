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

- add sandboxed injection mode for tightly controlled compatibility cases
- add adapter plugins for Vault, 1Password, AWS Secrets Manager, and GCP Secret Manager
- add rotation and expiry reporting

## v1.0

- add multi-tenant RBAC and audit partitioning
- add admin UI
- add deployment manifests for Kubernetes
- add formal conformance and security hardening suites
