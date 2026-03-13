# CLI

KeyLore includes a local operator CLI for managing the catalogue, inspecting audit events, and reviewing approvals without editing JSON files by hand.

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

### `auth tokens list`

```bash
npm run dev:cli -- auth tokens list --client-id demo-client --status active
```

### `auth tokens revoke`

```bash
npm run dev:cli -- auth tokens revoke <token-id>
```

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

### `system backup create`

```bash
npm run dev:cli -- system backup create --file ./keylore-backup.json
```

### `system backup inspect`

```bash
npm run dev:cli -- system backup inspect --file ./keylore-backup.json
```

### `system backup restore`

```bash
npm run dev:cli -- system backup restore --file ./keylore-backup.json --yes
```

### `approvals list`

```bash
npm run dev:cli -- approvals list --status pending
```

### `approvals approve`

```bash
npm run dev:cli -- approvals approve <approval-id> --note "approved for deployment"
```

### `approvals deny`

```bash
npm run dev:cli -- approvals deny <approval-id> --note "target not justified"
```

## Output

The CLI emits JSON so it can be piped into other tooling such as `jq`.
