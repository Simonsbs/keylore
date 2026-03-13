# Roadmap

## v0.2

- completed:
- PostgreSQL-backed persistence and migrations
- explicit output schemas for MCP tools
- request-size, rate-limit, timeout, and response-size controls
- admin CLI for catalogue and audit operations

- next:
- add adapter interface tests and secret-store adapter fixtures
- expand the admin CLI with policy and access-request workflows

## v0.3

- add OAuth 2.1 protected-resource metadata and token validation flow
- add approval-required policy outcomes
- add policy simulation endpoint and dry-run mode

## v0.4

- add sandboxed injection mode for tightly controlled compatibility cases
- add adapter plugins for Vault, 1Password, AWS Secrets Manager, and GCP Secret Manager
- add rotation and expiry reporting

## v1.0

- add multi-tenant RBAC and audit partitioning
- add admin UI
- add deployment manifests for Kubernetes
- add formal conformance and security hardening suites
