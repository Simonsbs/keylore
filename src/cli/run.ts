import fs from "node:fs/promises";

import { KeyLoreApp } from "../app.js";
import {
  accessRequestInputSchema,
  approvalReviewInputSchema,
  authClientCreateInputSchema,
  authClientRotateSecretInputSchema,
  authClientUpdateInputSchema,
  breakGlassRequestInputSchema,
  breakGlassReviewInputSchema,
  catalogSearchInputSchema,
  createCredentialInputSchema,
  rotationCompleteInputSchema,
  rotationCreateInputSchema,
  rotationTransitionInputSchema,
  runtimeExecutionInputSchema,
  updateCredentialInputSchema,
} from "../domain/types.js";
import { localOperatorContext } from "../services/auth-context.js";
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
  keylore catalog report [credential-id] [--principal name]
  keylore catalog create --file /path/to/credential.json [--principal name]
  keylore catalog update <credential-id> --file /path/to/patch.json [--principal name]
  keylore catalog delete <credential-id> [--principal name]
  keylore access request --file /path/to/request.json [--dry-run] [--principal name]
  keylore access simulate --file /path/to/request.json [--principal name]
  keylore auth clients list
  keylore auth clients create --file /path/to/client.json
  keylore auth clients update <client-id> --file /path/to/patch.json
  keylore auth clients enable <client-id>
  keylore auth clients disable <client-id>
  keylore auth clients rotate-secret <client-id> [--secret value]
  keylore auth tokens list [--client-id id] [--status active|revoked]
  keylore auth tokens revoke <token-id>
  keylore runtime run --file /path/to/runtime.json [--principal name]
  keylore system adapters
  keylore system maintenance
  keylore system maintenance run
  keylore system traces [--limit 20] [--trace-id uuid]
  keylore system trace-exporter
  keylore system trace-exporter flush
  keylore system rotations list [--status pending|in_progress|completed|failed|cancelled] [--credential-id id]
  keylore system rotations plan [--horizon-days 14]
  keylore system rotations create --file /path/to/rotation.json
  keylore system rotations start <rotation-id> [--note text]
  keylore system rotations complete <rotation-id> [--note text] [--target-ref ref] [--expires-at iso8601] [--last-validated-at iso8601]
  keylore system rotations fail <rotation-id> [--note text]
  keylore system backup create --file /path/to/backup.json
  keylore system backup inspect --file /path/to/backup.json
  keylore system backup restore --file /path/to/backup.json --yes
  keylore breakglass list [--status pending|active|denied|expired|revoked] [--requested-by name]
  keylore breakglass request --file /path/to/request.json [--principal name]
  keylore breakglass approve <request-id> [--note text] [--principal name]
  keylore breakglass deny <request-id> [--note text] [--principal name]
  keylore breakglass revoke <request-id> [--note text] [--principal name]
  keylore audit recent [--principal name] [--limit 20]
  keylore approvals list [--status pending|approved|denied|expired]
  keylore approvals approve <approval-id> [--note text]
  keylore approvals deny <approval-id> [--note text]

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
  const context = localOperatorContext(principalFor(app, parsed.flags));
  void readBooleanFlag(parsed.flags, "json");

  if (!resource || resource === "help" || parsed.flags.get("help") === true) {
    return helpText();
  }

  if (resource === "version") {
    return `${app.config.version}\n`;
  }

  if (resource === "catalog" && action === "list") {
    const limit = readNumberFlag(parsed.flags, "limit") ?? 50;
    const results = await app.broker.searchCatalog(context, { limit });
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
    const results = await app.broker.searchCatalog(context, input);
    return output({ credentials: results });
  }

  if (resource === "catalog" && action === "get") {
    if (!subject) {
      throw new Error("catalog get requires a credential id.");
    }

    const result = await app.broker.getCredential(context, subject);
    return output({ credential: result ?? null });
  }

  if (resource === "catalog" && action === "report") {
    const reports = await app.broker.listCredentialReports(context, subject);
    return output({ reports });
  }

  if (resource === "catalog" && action === "create") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("catalog create requires --file.");
    }

    const payload = createCredentialInputSchema.parse(await readJsonFile(filePath));
    const created = await app.broker.createCredential(context, payload);
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
    const updated = await app.broker.updateCredential(context, subject, payload);
    return output({ credential: updated });
  }

  if (resource === "catalog" && action === "delete") {
    if (!subject) {
      throw new Error("catalog delete requires a credential id.");
    }

    const deleted = await app.broker.deleteCredential(context, subject);
    return output({ deleted, credentialId: subject });
  }

  if (resource === "access" && (action === "request" || action === "simulate")) {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error(`access ${action} requires --file.`);
    }

    const payload = accessRequestInputSchema.parse(await readJsonFile(filePath));
    if (action === "simulate") {
      const decision = await app.broker.simulateAccess(context, payload);
      return output({ decision });
    }

    const decision = await app.broker.requestAccess(context, {
      ...payload,
      dryRun: readBooleanFlag(parsed.flags, "dry-run") || payload.dryRun,
    });
    return output({ decision });
  }

  if (resource === "auth" && action === "clients" && subject === "list") {
    const clients = await app.auth.listClients();
    return output({ clients });
  }

  if (resource === "auth" && action === "clients" && subject === "create") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("auth clients create requires --file.");
    }

    const payload = authClientCreateInputSchema.parse(await readJsonFile(filePath));
    const client = await app.auth.createClient(context, payload);
    return output(client);
  }

  if (resource === "auth" && action === "clients" && subject === "update") {
    const clientId = parsed.positionals[3];
    if (!clientId) {
      throw new Error("auth clients update requires a client id.");
    }

    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("auth clients update requires --file.");
    }

    const payload = authClientUpdateInputSchema.parse(await readJsonFile(filePath));
    const client = await app.auth.updateClient(context, clientId, payload);
    return output({ client: client ?? null });
  }

  if (resource === "auth" && action === "clients" && (subject === "enable" || subject === "disable")) {
    const clientId = parsed.positionals[3];
    if (!clientId) {
      throw new Error(`auth clients ${subject} requires a client id.`);
    }

    const client = await app.auth.updateClient(context, clientId, {
      status: subject === "enable" ? "active" : "disabled",
    });
    return output({ client: client ?? null });
  }

  if (resource === "auth" && action === "clients" && subject === "rotate-secret") {
    const clientId = parsed.positionals[3];
    if (!clientId) {
      throw new Error("auth clients rotate-secret requires a client id.");
    }

    const secret = authClientRotateSecretInputSchema.parse({
      clientSecret: readStringFlag(parsed.flags, "secret"),
    }).clientSecret;
    const result = await app.auth.rotateClientSecret(context, clientId, secret);
    return output(result ? result : { client: null });
  }

  if (resource === "auth" && action === "tokens" && subject === "list") {
    const tokens = await app.auth.listTokens({
      clientId: readStringFlag(parsed.flags, "client-id"),
      status: readStringFlag(parsed.flags, "status") as "active" | "revoked" | undefined,
    });
    return output({ tokens });
  }

  if (resource === "auth" && action === "tokens" && subject === "revoke") {
    const tokenId = parsed.positionals[3];
    if (!tokenId) {
      throw new Error("auth tokens revoke requires a token id.");
    }

    const token = await app.auth.revokeToken(context, tokenId);
    return output({ token: token ?? null });
  }

  if (resource === "runtime" && action === "run") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("runtime run requires --file.");
    }

    const payload = runtimeExecutionInputSchema.parse(await readJsonFile(filePath));
    const result = await app.broker.runSandboxed(context, payload);
    return output({ result });
  }

  if (resource === "system" && action === "adapters") {
    const adapters = await app.broker.adapterHealth();
    return output({ adapters });
  }

  if (resource === "system" && action === "maintenance" && !subject) {
    return output({ maintenance: app.maintenance.status() });
  }

  if (resource === "system" && action === "maintenance" && subject === "run") {
    const result = await app.maintenance.runOnce();
    return output({ maintenance: app.maintenance.status(), result });
  }

  if (resource === "system" && action === "traces") {
    const limit = readNumberFlag(parsed.flags, "limit") ?? 20;
    const traceId = readStringFlag(parsed.flags, "trace-id");
    return output({ traces: app.traces.recent(limit, traceId) });
  }

  if (resource === "system" && action === "trace-exporter" && !subject) {
    return output({ exporter: app.traceExports.status() });
  }

  if (resource === "system" && action === "trace-exporter" && subject === "flush") {
    return output({ exporter: await app.traceExports.flushNow() });
  }

  if (resource === "system" && action === "rotations" && subject === "list") {
    const rotations = await app.rotations.list({
      status: readStringFlag(parsed.flags, "status") as
        | "pending"
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
        | undefined,
      credentialId: readStringFlag(parsed.flags, "credential-id"),
    });
    return output({ rotations });
  }

  if (resource === "system" && action === "rotations" && subject === "plan") {
    const rotations = await app.rotations.planDue(context, {
      horizonDays: readNumberFlag(parsed.flags, "horizon-days") ?? app.config.rotationPlanningHorizonDays,
    });
    return output({ rotations });
  }

  if (resource === "system" && action === "rotations" && subject === "create") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("system rotations create requires --file.");
    }
    const payload = rotationCreateInputSchema.parse(await readJsonFile(filePath));
    return output({ rotation: await app.rotations.createManual(context, payload) });
  }

  if (resource === "system" && action === "rotations" && (subject === "start" || subject === "fail")) {
    const rotationId = parsed.positionals[3];
    if (!rotationId) {
      throw new Error(`system rotations ${subject} requires a rotation id.`);
    }
    const payload = rotationTransitionInputSchema.parse({
      note: readStringFlag(parsed.flags, "note"),
    });
    const rotation =
      subject === "start"
        ? await app.rotations.start(rotationId, context, payload.note)
        : await app.rotations.fail(rotationId, context, payload.note);
    return output({ rotation: rotation ?? null });
  }

  if (resource === "system" && action === "rotations" && subject === "complete") {
    const rotationId = parsed.positionals[3];
    if (!rotationId) {
      throw new Error("system rotations complete requires a rotation id.");
    }
    const payload = rotationCompleteInputSchema.parse({
      note: readStringFlag(parsed.flags, "note"),
      targetRef: readStringFlag(parsed.flags, "target-ref"),
      expiresAt: readStringFlag(parsed.flags, "expires-at"),
      lastValidatedAt: readStringFlag(parsed.flags, "last-validated-at"),
    });
    const rotation = await app.rotations.complete(rotationId, context, payload);
    return output({ rotation: rotation ?? null });
  }

  if (resource === "system" && action === "backup" && subject === "create") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("system backup create requires --file.");
    }

    const backup = await app.backup.writeBackup(filePath, context);
    return output({
      file: filePath,
      createdAt: backup.createdAt,
      credentials: backup.credentials.length,
      authClients: backup.authClients.length,
      accessTokens: backup.accessTokens.length,
      approvals: backup.approvals.length,
      breakGlassRequests: backup.breakGlassRequests.length,
      rotationRuns: backup.rotationRuns.length,
      auditEvents: backup.auditEvents.length,
    });
  }

  if (resource === "system" && action === "backup" && subject === "inspect") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("system backup inspect requires --file.");
    }

    const backup = await app.backup.readBackup(filePath);
    return output({
      file: filePath,
      format: backup.format,
      version: backup.version,
      sourceVersion: backup.sourceVersion,
      createdAt: backup.createdAt,
      credentials: backup.credentials.length,
      authClients: backup.authClients.length,
      accessTokens: backup.accessTokens.length,
      approvals: backup.approvals.length,
      breakGlassRequests: backup.breakGlassRequests.length,
      rotationRuns: backup.rotationRuns.length,
      auditEvents: backup.auditEvents.length,
    });
  }

  if (resource === "system" && action === "backup" && subject === "restore") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("system backup restore requires --file.");
    }
    if (!readBooleanFlag(parsed.flags, "yes")) {
      throw new Error("system backup restore requires --yes.");
    }

    const backup = await app.backup.restoreBackup(filePath, context);
    return output({
      restored: true,
      file: filePath,
      sourceVersion: backup.sourceVersion,
      createdAt: backup.createdAt,
      credentials: backup.credentials.length,
      authClients: backup.authClients.length,
      accessTokens: backup.accessTokens.length,
      approvals: backup.approvals.length,
      breakGlassRequests: backup.breakGlassRequests.length,
      rotationRuns: backup.rotationRuns.length,
      auditEvents: backup.auditEvents.length,
    });
  }

  if (resource === "audit" && action === "recent") {
    const limit = readNumberFlag(parsed.flags, "limit") ?? 20;
    const events = await app.broker.listRecentAuditEvents(limit);
    return output({ events });
  }

  if (resource === "breakglass" && action === "list") {
    const requests = await app.broker.listBreakGlassRequests({
      status: readStringFlag(parsed.flags, "status") as
        | "pending"
        | "active"
        | "denied"
        | "expired"
        | "revoked"
        | undefined,
      requestedBy: readStringFlag(parsed.flags, "requested-by"),
    });
    return output({ requests });
  }

  if (resource === "breakglass" && action === "request") {
    const filePath = readStringFlag(parsed.flags, "file");
    if (!filePath) {
      throw new Error("breakglass request requires --file.");
    }

    const payload = breakGlassRequestInputSchema.parse(await readJsonFile(filePath));
    const request = await app.broker.createBreakGlassRequest(context, payload);
    return output({ request });
  }

  if (resource === "breakglass" && (action === "approve" || action === "deny" || action === "revoke")) {
    if (!subject) {
      throw new Error(`breakglass ${action} requires a request id.`);
    }

    const note = breakGlassReviewInputSchema.parse({
      note: readStringFlag(parsed.flags, "note"),
    }).note;
    const request =
      action === "approve"
        ? await app.broker.reviewBreakGlassRequest(context, subject, "active", note)
        : action === "deny"
          ? await app.broker.reviewBreakGlassRequest(context, subject, "denied", note)
          : await app.broker.revokeBreakGlassRequest(context, subject, note);
    return output({ request: request ?? null });
  }

  if (resource === "approvals" && action === "list") {
    const status = readStringFlag(parsed.flags, "status") as
      | "pending"
      | "approved"
      | "denied"
      | "expired"
      | undefined;
    const approvals = await app.broker.listApprovalRequests(status);
    return output({ approvals });
  }

  if (resource === "approvals" && (action === "approve" || action === "deny")) {
    if (!subject) {
      throw new Error(`approvals ${action} requires an approval id.`);
    }

    const note = approvalReviewInputSchema.parse({
      note: readStringFlag(parsed.flags, "note"),
    }).note;
    const approval = await app.broker.reviewApprovalRequest(
      context,
      subject,
      action === "approve" ? "approved" : "denied",
      note,
    );
    return output({ approval: approval ?? null });
  }

  throw new Error(`Unknown command: ${parsed.positionals.join(" ")}`);
}
