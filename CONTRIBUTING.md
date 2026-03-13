# Contributing

## Principles

- preserve the "access without exposure" model from `KeyLore.md`
- favor deterministic authorization and proxy execution over exposing credentials to tools
- keep secrets out of tests, examples, logs, and fixtures
- do not expand proxy capabilities without explicit policy controls and tests

## Local workflow

```bash
npm install
npm run typecheck
npm test
npm run build
```

## Pull request expectations

- explain the threat-model impact of the change
- add or update tests for behavioral changes
- document new env vars, endpoints, or MCP tools
- keep changes small enough to review rigorously

## Commit hygiene

- use clear, scoped commit messages
- avoid mixing refactors with behavior changes unless necessary
- never include real credentials or tenant data
