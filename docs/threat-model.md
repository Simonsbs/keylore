# Threat Model

## Primary risks

- prompt injection through tool descriptions or upstream content
- accidental secret disclosure in MCP responses
- accidental secret disclosure in logs or audit records
- policy bypass by changing target URLs or headers
- token replay or token misuse across protected resources
- unreviewed sensitive access when a policy should require human approval
- emergency override abuse through a break-glass path that outlives its intended recovery window
- over-broad proxy behavior that becomes a generic exfiltration tunnel
- sandbox injection being abused for credential exfiltration through process output or arbitrary command execution

## Current mitigations

- the catalogue returns metadata only
- the broker performs outbound calls itself
- policy is default-deny
- domains and operations are validated before resolution
- request headers such as `Authorization` and `Cookie` are stripped from user input
- proxy responses are redacted and truncated before return
- secret values are resolved from environment bindings only at execution time
- database-backed state is migrated on startup instead of mutated directly in local files
- HTTP request size limits and PostgreSQL-backed rate limits reduce trivial abuse paths
- outbound calls are bounded by timeout and response-size caps
- remote access is mediated by issued bearer tokens with scopes, roles, and optional resource binding
- approval-required policies create persisted review records before access is allowed
- audit records capture approval creation and approval review actions
- auth-client mutations revoke stale tokens instead of leaving old privilege snapshots active
- simulation and dry-run modes let operators validate policy paths without leaking secrets or hitting upstream systems
- sandbox mode is disabled by default and requires an explicit executable allowlist, a dedicated scope, and output scrubbing
- sandbox env injection rejects reserved env overrides and non-allowlisted env variables
- provider adapters expose metadata for rotation/expiry reporting without returning secret material
- adapter retries and circuit breaking reduce repeated backend failure thrash
- logical backups provide an auditable recovery path for self-hosted operators
- break-glass requests are persisted, time-bounded, explicitly reviewed, and audited when used
- egress policy blocks private, loopback, and link-local targets unless explicitly allowed
- release workflow produces SBOMs and vulnerability scan artifacts before tagged distribution

## Known gaps

- no tenant isolation layer yet
- no external identity provider integration or end-user delegated OAuth flows yet
- no distributed trace backend or anomaly detection pipeline is shipped yet
- release signing depends on GitHub OIDC and tagged release flow; it is not enforced for ad hoc local images
- break-glass approval is still single-step and has no notification or paging integration

## Review rule

Any change that broadens:

- supported outbound methods
- target URL flexibility
- adapter capabilities
- logging fields
- transport auth behavior

must update this document and add tests.
