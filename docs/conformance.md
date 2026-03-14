# Conformance

`v1.0.0-rc3` continues the three release-candidate gates for KeyLore: contract, conformance, and hardening, and adds a live container smoke check to the recommended release flow.

## Purpose

The regular integration suite already covers broad functionality. The release-candidate suites narrow that down to a small set of release-blocking expectations:

- `test:contracts`: frozen OAuth metadata and MCP tool identifiers still match the public `rc1` contract
- `test:conformance`: core auth, tenancy, and backup-boundary behavior still matches the intended public contract
- `test:hardening`: replay, delegated-admin, and tenant-safe recovery abuse paths stay blocked

Together they guard:

- OAuth metadata and protected-resource metadata
- public-client grant restrictions
- disabled-tenant token behavior
- MCP tool-contract stability
- single-use authorization codes and rotated refresh tokens
- tenant-scoped backup restore boundaries
- delegated auth-admin tenant isolation

## Run

```bash
npm run test:contracts
npm run test:conformance
npm run test:hardening
```

These suites are also run in CI in addition to the broader `npm test` suite.

## Release expectation

A release candidate should pass:

```bash
npm run typecheck
npm test
npm run test:contracts
npm run test:conformance
npm run test:hardening
npm run build
docker run --rm --entrypoint sh -v "$PWD:/workspace" -w /workspace alpine/helm:3.17.1 ./scripts/helm-validate.sh
```

## Scope boundaries

This is not a third-party certification. It is a repository-defined compatibility and hardening gate for KeyLore itself. The goal is to make regressions obvious before `v1.0`, especially around auth, tenancy, recovery, and delegated operator boundaries.
