# Security Policy

## Scope

KeyLore is a secrets-adjacent system. Treat any bug that could expose secret material, bypass policy, weaken auditability, or broaden proxy scope as security-sensitive.

## Reporting

While the repository remains private, report vulnerabilities directly to the repository owner instead of opening a normal issue.

Once the repository is public:

- do not publish exploit details in a public issue first
- use GitHub Security Advisories when available
- include impact, affected version or commit, reproduction steps, and suggested mitigations

## Response goals

- acknowledge receipt within 3 business days
- provide an initial triage decision within 7 business days
- ship a fix or compensating control as quickly as the issue severity warrants

## Security boundaries

The following are explicit project boundaries and should remain true in all changes:

- secret values must not be returned by MCP tools
- secret values must not be written to logs or audit events
- access must remain default-deny
- target domains and operations must remain policy-constrained
- remote transports must be authenticated before use
