# Threat Model

## Primary risks

- prompt injection through tool descriptions or upstream content
- accidental secret disclosure in MCP responses
- accidental secret disclosure in logs or audit records
- policy bypass by changing target URLs or headers
- over-broad proxy behavior that becomes a generic exfiltration tunnel

## Current mitigations

- the catalogue returns metadata only
- the broker performs outbound calls itself
- policy is default-deny
- domains and operations are validated before resolution
- request headers such as `Authorization` and `Cookie` are stripped from user input
- proxy responses are redacted and truncated before return
- secret values are resolved from environment bindings only at execution time
- database-backed state is migrated on startup instead of mutated directly in local files
- HTTP request size and rate limits reduce trivial abuse paths
- outbound calls are bounded by timeout and response-size caps

## Known gaps

- remote MCP uses bearer-token protection today, not full OAuth 2.1
- no human approval workflow yet
- no sandbox injection mode yet
- rate limiting is local-memory only; no distributed limiter or anomaly detection yet
- no tenant isolation layer yet

## Review rule

Any change that broadens:

- supported outbound methods
- target URL flexibility
- adapter capabilities
- logging fields
- transport auth behavior

must update this document and add tests.
