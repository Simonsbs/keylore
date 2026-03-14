# CLI

KeyLore includes a local operator CLI for managing the catalogue, inspecting audit events, reviewing approvals, handling break-glass requests, and working with logical backups without editing JSON files by hand.

The local CLI runs as a global operator and can work across tenants. When input files contain `tenantId`, the CLI preserves it. Tenant-scoped remote HTTP and MCP callers do not get that cross-tenant visibility.

## Usage

```bash
npm run dev:cli -- help
```

After building:

```bash
node dist/cli.js help
```

## Commands

### `catalog list`

```bash
npm run dev:cli -- catalog list --limit 20
```

### `catalog search`

```bash
npm run dev:cli -- catalog search --query github --service github --limit 5
```

Supported filters:

- `--query`
- `--service`
- `--owner`
- `--scope-tier`
- `--sensitivity`
- `--status`
- `--tag`
- `--limit`
- `--principal`

### `catalog get`

```bash
npm run dev:cli -- catalog get github-readonly-demo
```

### `catalog report`

```bash
npm run dev:cli -- catalog report
npm run dev:cli -- catalog report github-readonly-demo
```

### `catalog create`

```bash
npm run dev:cli -- catalog create --file ./credential.json
```

The file must contain a full credential metadata object matching the repository schema.
Include `tenantId` when creating a non-default tenant record.

### `catalog update`

```bash
npm run dev:cli -- catalog update github-readonly-demo --file ./patch.json
```

The file must contain a partial credential patch object.

### `catalog delete`

```bash
npm run dev:cli -- catalog delete github-readonly-demo
```

### `access request`

```bash
npm run dev:cli -- access request --file ./request.json
```

Add `--dry-run` to evaluate without executing the outbound call.

### `access simulate`

```bash
npm run dev:cli -- access simulate --file ./request.json
```

### `audit recent`

```bash
npm run dev:cli -- audit recent --limit 10
```

### `auth clients list`

```bash
npm run dev:cli -- auth clients list
```

### `auth clients create`

```bash
npm run dev:cli -- auth clients create --file ./client.json
```

Shared-secret clients use `tokenEndpointAuthMethod: "client_secret_basic"` or `"client_secret_post"`. `private_key_jwt` clients omit `clientSecret` and provide `jwks`.
Public interactive clients use `tokenEndpointAuthMethod: "none"`, `grantTypes: ["authorization_code", "refresh_token"]`, and at least one `redirectUri`.
Include `tenantId` when creating a tenant-scoped client.

### `auth clients update`

```bash
npm run dev:cli -- auth clients update <client-id> --file ./client-patch.json
```

### `auth clients enable`

```bash
npm run dev:cli -- auth clients enable <client-id>
```

### `auth clients disable`

```bash
npm run dev:cli -- auth clients disable <client-id>
```

### `auth clients rotate-secret`

```bash
npm run dev:cli -- auth clients rotate-secret <client-id>
```

### `auth authorize`

```bash
npm run dev:cli -- auth authorize --file ./authorize.json
```

Use this to mint a short-lived PKCE-bound authorization code for an interactive client from the current operator context.

### `auth tokens list`

```bash
npm run dev:cli -- auth tokens list --client-id demo-client --status active
```

### `auth tokens revoke`

```bash
npm run dev:cli -- auth tokens revoke <token-id>
```

### `auth refresh-tokens list`

```bash
npm run dev:cli -- auth refresh-tokens list --client-id public-mcp-client --status active
```

### `auth refresh-tokens revoke`

```bash
npm run dev:cli -- auth refresh-tokens revoke <refresh-token-id>
```

### `tenants list`

```bash
npm run dev:cli -- tenants list
```

### `tenants get`

```bash
npm run dev:cli -- tenants get tenant-a
```

### `tenants create`

```bash
npm run dev:cli -- tenants create --file ./tenant.json
```

### `tenants update`

```bash
npm run dev:cli -- tenants update tenant-a --file ./tenant-patch.json
```

### `tenants bootstrap`

```bash
npm run dev:cli -- tenants bootstrap --file ./tenant-bootstrap.json
```

Creates a tenant plus any seed auth clients in one operation.

### `runtime run`

```bash
npm run dev:cli -- runtime run --file ./runtime.json
```

### `system adapters`

```bash
npm run dev:cli -- system adapters
```

### `system maintenance`

```bash
npm run dev:cli -- system maintenance
npm run dev:cli -- system maintenance run
```

### `system traces`

```bash
npm run dev:cli -- system traces --limit 20
npm run dev:cli -- system traces --trace-id deploy-trace-123
```

### `system trace-exporter`

```bash
npm run dev:cli -- system trace-exporter
npm run dev:cli -- system trace-exporter flush
```

### `system rotations list`

```bash
npm run dev:cli -- system rotations list --status pending
```

### `system rotations plan`

```bash
npm run dev:cli -- system rotations plan --horizon-days 14
```

### `system rotations create`

```bash
npm run dev:cli -- system rotations create --file ./rotation-create.json
```

### `system rotations start`

```bash
npm run dev:cli -- system rotations start <rotation-id> --note "began rotation"
```

### `system rotations complete`

```bash
npm run dev:cli -- system rotations complete <rotation-id> --file ./rotation-complete.json
```

### `system rotations fail`

```bash
npm run dev:cli -- system rotations fail <rotation-id> --note "backend issue"
```

### `system backup create`

```bash
npm run dev:cli -- system backup create --file ./keylore-backup.json
```

When the CLI is run as the built-in local operator, the backup is full-instance. Remote tenant-scoped backup operators only receive tenant-scoped backups through the HTTP API.

### `system backup inspect`

```bash
npm run dev:cli -- system backup inspect --file ./keylore-backup.json
```

### `system backup restore`

```bash
npm run dev:cli -- system backup restore --file ./keylore-backup.json --yes
```

### `breakglass list`

```bash
npm run dev:cli -- breakglass list --status pending
```

### `breakglass request`

```bash
npm run dev:cli -- breakglass request --file ./breakglass-request.json
```

### `breakglass approve`

```bash
npm run dev:cli -- breakglass approve <request-id> --note "approved for emergency recovery"
```

If break-glass review quorum is greater than `1`, the request stays `pending` until enough distinct reviewers approve it.

### `breakglass deny`

```bash
npm run dev:cli -- breakglass deny <request-id> --note "insufficient justification"
```

### `breakglass revoke`

```bash
npm run dev:cli -- breakglass revoke <request-id> --note "incident closed"
```

### `ops:restore-drill`

```bash
KEYLORE_DATABASE_URL=postgresql://... \
KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET=... \
KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET=... \
npm run ops:restore-drill
```

### `approvals list`

```bash
npm run dev:cli -- approvals list --status pending
```

### `approvals approve`

```bash
npm run dev:cli -- approvals approve <approval-id> --note "approved for deployment"
```

If approval quorum is greater than `1`, the request stays `pending` until enough distinct reviewers approve it.

### `approvals deny`

```bash
npm run dev:cli -- approvals deny <approval-id> --note "target not justified"
```

## Output

The CLI emits JSON so it can be piped into other tooling such as `jq`.
