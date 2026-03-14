# Compatibility

`v1.0.0-rc1` freezes the current public contract so the remaining path to `v1.0` is hardening and operator UI work, not backend churn.

## Frozen surface

The following are considered stable from `v1.0.0-rc1` to `v1.0.0`:

- OAuth grant types: `client_credentials`, `authorization_code`, `refresh_token`
- Token auth methods: `client_secret_post`, `client_secret_basic`, `private_key_jwt`, `none`
- Protected resources:
  - `<publicBaseUrl>/v1`
  - `<publicBaseUrl>/mcp`
- REST base path families documented in [docs/api.md](/home/simon/keylore/docs/api.md)
- MCP tool identifiers:
  - `catalog_search`
  - `catalog_get`
  - `catalog_report`
  - `access_request`
  - `policy_simulate`
  - `audit_recent`
  - `system_adapters`
  - `system_maintenance_status`
  - `system_recent_traces`
  - `system_trace_exporter_status`
  - `system_rotation_list`
  - `system_rotation_plan`
  - `system_rotation_create`
  - `system_rotation_complete`
  - `break_glass_request`
  - `break_glass_list`
  - `break_glass_review`
  - `runtime_run_sandboxed`

## Allowed before `v1.0`

- additive optional response fields
- additive documentation, examples, and operator guidance
- internal implementation changes that preserve the documented contract
- additional tests and release gates

## Not allowed before `v1.0`

- renaming or removing REST paths, OAuth metadata fields, protected-resource identifiers, or MCP tool names
- tightening default behavior in a way that breaks documented successful flows
- changing tenant-isolation semantics or resource binding semantics
- exposing secret values in MCP outputs, REST responses, traces, logs, or audit events

## Enforcement

The frozen surface is guarded by:

- [src/test/contract.test.ts](/home/simon/keylore/src/test/contract.test.ts)
- [src/test/conformance.test.ts](/home/simon/keylore/src/test/conformance.test.ts)
- [src/test/hardening.test.ts](/home/simon/keylore/src/test/hardening.test.ts)
- CI and release workflows in [ci.yml](/home/simon/keylore/.github/workflows/ci.yml) and [release.yml](/home/simon/keylore/.github/workflows/release.yml)
