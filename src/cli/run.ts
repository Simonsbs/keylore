import fs from "node:fs/promises";

import { KeyLoreApp } from "../app.js";
import {
  catalogSearchInputSchema,
  createCredentialInputSchema,
  updateCredentialInputSchema,
} from "../domain/types.js";
import {
  parseCliArgs,
  readBooleanFlag,
  readNumberFlag,
  readStringFlag,
} from "./args.js";

function helpText(): string {
  return `KeyLore CLI

Usage:
  keylore help
  keylore version
  keylore catalog list [--principal name] [--limit 20]
  keylore catalog search [--query text] [--service name] [--owner name] [--scope-tier tier] [--sensitivity level] [--status active|disabled] [--tag tag] [--limit 20]
  keylore catalog get <credential-id> [--principal name]
  keylore catalog create --file /path/to/credential.json [--principal name]
  keylore catalog update <credential-id> --file /path/to/patch.json [--principal name]
  keylore catalog delete <credential-id> [--principal name]
  keylore audit recent [--principal name] [--limit 20]

Flags:
  --json      Force JSON output. This is the default.
`;
}

function output(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function principalFor(app: KeyLoreApp, flags: Map<string, string | boolean>): string {
  return readStringFlag(flags, "principal") ?? app.config.defaultPrincipal;
}

export async function runCli(app: KeyLoreApp, argv: string[]): Promise<string> {
  const parsed = parseCliArgs(argv);
  const [resource, action, subject] = parsed.positionals;
  const principal = principalFor(app, parsed.flags);
  void readBooleanFlag(parsed.flags, "json");

  if (!resource || resource === "help" || parsed.flags.get("help") === true) {
    return helpText();
  }

  if (resource === "version") {
    return `${app.config.version}\n`;
  }

  if (resource === "catalog" && action === "list") {
    const limit = readNumberFlag(parsed.flags, "limit") ?? 50;
    const results = await app.broker.searchCatalog(principal, { limit });
    return output({ credentials: results });
  }

  if (resource === "catalog" && action === "search") {
    const input = catalogSearchInputSchema.parse({
      query: readStringFlag(parsed.flags, "query"),
      service: readStringFlag(parsed.flags, "service"),
      owner: readStringFlag(parsed.flags, "owner"),
      scopeTier: readStringFlag(parsed.flags, "scope-tier"),
      sensitivity: readStringFlag(parsed.flags, "sensitivity"),
      status: readStringFlag(parsed.flags, "status"),
      tag: readStringFlag(parsed.flags, "tag"),
      limit: readNumberFlag(parsed.flags, "limit") ?? 10,
    });
    const results = await app.broker.searchCatalog(principal, input);
    return output({ credentials: results });
  }

  if (resource === "catalog" && action === "get") {
    if (!subject) {
      throw new Error("catalog get requires a credential id.");
    }

    const result = await app.broker.getCredential(principal, subject);
    return output({ credential: result ?? null });
  }

  if (resource === "catalog" && action === "create") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("catalog create requires --file.");
    }

    const payload = createCredentialInputSchema.parse(await readJsonFile(filePath));
    const created = await app.broker.createCredential(principal, payload);
    return output({ credential: created });
  }

  if (resource === "catalog" && action === "update") {
    if (!subject) {
      throw new Error("catalog update requires a credential id.");
    }

    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("catalog update requires --file.");
    }

    const payload = updateCredentialInputSchema.parse(await readJsonFile(filePath));
    const updated = await app.broker.updateCredential(principal, subject, payload);
    return output({ credential: updated });
  }

  if (resource === "catalog" && action === "delete") {
    if (!subject) {
      throw new Error("catalog delete requires a credential id.");
    }

    const deleted = await app.broker.deleteCredential(principal, subject);
    return output({ deleted, credentialId: subject });
  }

  if (resource === "audit" && action === "recent") {
    const limit = readNumberFlag(parsed.flags, "limit") ?? 20;
    const events = await app.broker.listRecentAuditEvents(limit);
    return output({ events });
  }

  throw new Error(`Unknown command: ${parsed.positionals.join(" ")}`);
}
