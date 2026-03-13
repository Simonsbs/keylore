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

### `audit recent`

```bash
npm run dev:cli -- audit recent --limit 10
```

### `auth clients list`

```bash
npm run dev:cli -- auth clients list
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
