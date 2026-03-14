# Tenant Operations

`v0.12` treats tenant lifecycle as an operator responsibility with explicit backup boundaries.

## Tenant lifecycle

Create a tenant:

```bash
npm run dev:cli -- tenants create --file ./tenant.json
```

Bootstrap a tenant with seed auth clients:

```bash
npm run dev:cli -- tenants bootstrap --file ./tenant-bootstrap.json
```

Inspect and update a tenant:

```bash
npm run dev:cli -- tenants get tenant-a
npm run dev:cli -- tenants update tenant-a --file ./tenant-patch.json
```

## Interactive auth setup

For a public interactive client, configure:

- `tokenEndpointAuthMethod: "none"`
- `grantTypes: ["authorization_code", "refresh_token"]`
- at least one `redirectUri`

Then mint an operator bearer token, call `POST /oauth/authorize` with a PKCE challenge, and exchange the code at `POST /oauth/token`.

## Backup boundary rules

Global operators may export and restore the full system.

Tenant-scoped backup operators are intentionally narrower:

- backup export includes only their own tenant record and tenant-owned rows
- backup restore only replaces rows inside their own tenant
- restore is rejected if the payload includes any foreign tenant data

This prevents a tenant-bound operator from using backup flows to read or overwrite another tenant.

## Recovery guidance

For tenant-scoped recovery:

1. export a tenant-scoped backup with the tenant backup operator token
2. inspect the summary and verify it contains only the expected tenant
3. restore only that tenant payload
4. verify the tenant’s credentials, clients, and tokens without disturbing other tenants

For full-instance recovery, use the global backup flow from [operations.md](/home/simon/keylore/docs/operations.md).
