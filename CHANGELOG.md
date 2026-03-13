# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project follows semantic versioning.

## [Unreleased]

## [0.7.0] - 2026-03-14

### Added

- Specialized `auth_admin`, `maintenance_operator`, `backup_operator`, and `breakglass_operator` roles with matching delegated scopes.
- Audited break-glass workflow across API, CLI, MCP, backup, and maintenance cleanup.
- Egress hardening for blocked private and link-local targets plus HTTPS port allowlisting.
- Sandbox env allowlisting and reserved-variable protection.
- Backup export, inspect, and restore endpoints for self-hosted operators.
- Additional security and abuse-case coverage for the new guardrails.

## [0.6.0] - 2026-03-14

### Added

- Helm chart and environment-specific values for dev, staging, and production deployment.
- Release workflow for tagged builds, SBOM generation, Trivy scanning, and keyless image signing.
- Observability artifacts including Grafana dashboard and Prometheus alert rules.
- Restore-drill automation script and additional CLI restore coverage.

## [0.5.0] - 2026-03-14

### Added

- Prometheus-style metrics and request correlation for HTTP operations.
- PostgreSQL-backed shared rate limiting.
- Background maintenance and logical backup/restore tooling.
- Adapter retries and circuit breaking.
