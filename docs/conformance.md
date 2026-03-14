# Conformance

`v0.12` introduces an explicit conformance gate for the KeyLore release path.

## Purpose

The regular integration suite already covers broad functionality. The conformance suite narrows that down to a small set of release-blocking expectations:

- OAuth metadata and protected-resource metadata match the supported contract
- public OAuth clients cannot escalate into `client_credentials`
- disabled tenants cannot mint or keep using bearer tokens
- tenant-scoped backup operators can export and restore only their own tenant

## Run

```bash
npm run test:conformance
```

This suite is also run in CI in addition to the broader `npm test` suite.

## Release expectation

A release candidate should pass:

```bash
npm run typecheck
npm test
npm run test:conformance
npm run build
docker run --rm --entrypoint sh -v "$PWD:/workspace" -w /workspace alpine/helm:3.17.1 ./scripts/helm-validate.sh
```

## Scope boundaries

This is not a formal third-party certification. It is a repository-defined compatibility and hardening gate for KeyLore itself. The goal is to make regressions obvious before `v1.0`, especially around auth, tenancy, and recovery boundaries.
