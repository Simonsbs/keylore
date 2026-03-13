import { randomUUID } from "node:crypto";

import { SecretAdapterRegistry } from "../adapters/adapter-registry.js";
import { daysUntil } from "../adapters/reference-utils.js";
import {
  AccessDecision,
  AccessMode,
  AccessRequestInput,
  ApprovalRequest,
  AdapterHealth,
  approvalRequestSchema,
  AuthContext,
  breakGlassRequestInputSchema,
  BreakGlassRequest,
  CatalogSearchInput,
  CredentialStatusReport,
  CredentialRecord,
  CredentialSummary,
  credentialSummarySchema,
  RuntimeExecutionInput,
  RuntimeExecutionResult,
} from "../domain/types.js";
import { KeyLoreConfig } from "../config.js";
import { CredentialRepository, PolicyRepository } from "../repositories/interfaces.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { SandboxRunner } from "../runtime/sandbox-runner.js";
import { ApprovalService } from "./approval-service.js";
import { BreakGlassService } from "./break-glass-service.js";
import { PolicyDecision, PolicyEngine } from "./policy-engine.js";

function summarizeCredential(credential: CredentialRecord): CredentialSummary {
  return credentialSummarySchema.parse({
    ...credential,
  });
}

function truncate(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  return {
    text: `${text.slice(0, maxLength)}\n...[truncated]`,
    truncated: true,
  };
}

function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) {
    return {};
  }

  const blockedHeaders = new Set(["authorization", "proxy-authorization", "cookie"]);
  const sanitizedEntries = Object.entries(headers).filter(
    ([name]) => !blockedHeaders.has(name.toLowerCase()),
  );

  return Object.fromEntries(sanitizedEntries);
}

function redactText(text: string, secret: string): string {
  return text
    .replaceAll(secret, "[REDACTED_SECRET]")
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "[REDACTED_GITHUB_TOKEN]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED_TOKEN]");
}

function methodForOperation(operation: AccessRequestInput["operation"]): "GET" | "POST" {
  return operation === "http.post" ? "POST" : "GET";
}

async function readLimitedResponseBody(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) {
    return { text: "", truncated: false };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      const allowed = value.subarray(0, Math.max(0, value.byteLength - (total - maxBytes)));
      if (allowed.byteLength > 0) {
        chunks.push(allowed);
      }
      truncated = true;
      await reader.cancel();
      break;
    }

    chunks.push(value);
  }

  const combined = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
  return { text: combined, truncated };
}

export class BrokerService {
  public constructor(
    private readonly credentials: CredentialRepository,
    private readonly policies: PolicyRepository,
    private readonly audit: PgAuditLogService,
    private readonly adapters: SecretAdapterRegistry,
    private readonly policyEngine: PolicyEngine,
    private readonly approvals: ApprovalService,
    private readonly breakGlass: BreakGlassService,
    private readonly sandbox: SandboxRunner,
    private readonly validateTarget: (rawUrl: string, config: KeyLoreConfig) => Promise<URL>,
    private readonly config: KeyLoreConfig,
  ) {}

  public async searchCatalog(
    context: AuthContext,
    input: CatalogSearchInput,
  ): Promise<CredentialSummary[]> {
    const correlationId = randomUUID();
    const results = (await this.credentials.search(input)).map(summarizeCredential);

    await this.audit.record({
      type: "catalog.search",
      action: "catalog.search",
      outcome: "success",
      principal: context.principal,
      correlationId,
      metadata: {
        query: input.query ?? null,
        filters: input,
        resultCount: results.length,
      },
    });

    return results;
  }

  public async listCredentials(context: AuthContext): Promise<CredentialSummary[]> {
    return this.searchCatalog(context, { limit: 50 });
  }

  public async countCredentials(): Promise<number> {
    return this.credentials.count();
  }

  public async getCredential(
    context: AuthContext,
    id: string,
  ): Promise<CredentialSummary | undefined> {
    const correlationId = randomUUID();
    const credential = await this.credentials.getById(id);

    await this.audit.record({
      type: "catalog.read",
      action: "catalog.get",
      outcome: credential ? "success" : "error",
      principal: context.principal,
      correlationId,
      metadata: {
        credentialId: id,
        found: Boolean(credential),
      },
    });

    return credential ? summarizeCredential(credential) : undefined;
  }

  public async createCredential(context: AuthContext, credential: CredentialRecord): Promise<CredentialRecord> {
    const created = await this.credentials.create(credential);

    await this.audit.record({
      type: "catalog.write",
      action: "catalog.create",
      outcome: "success",
      principal: context.principal,
      metadata: {
        credentialId: created.id,
        service: created.service,
      },
    });

    return created;
  }

  public async updateCredential(
    context: AuthContext,
    id: string,
    patch: Partial<Omit<CredentialRecord, "id">>,
  ): Promise<CredentialRecord> {
    const updated = await this.credentials.update(id, patch);

    await this.audit.record({
      type: "catalog.write",
      action: "catalog.update",
      outcome: "success",
      principal: context.principal,
      metadata: {
        credentialId: id,
        fields: Object.keys(patch),
      },
    });

    return updated;
  }

  public async deleteCredential(context: AuthContext, id: string): Promise<boolean> {
    const deleted = await this.credentials.delete(id);

    await this.audit.record({
      type: "catalog.write",
      action: "catalog.delete",
      outcome: deleted ? "success" : "error",
      principal: context.principal,
      metadata: {
        credentialId: id,
      },
    });

    return deleted;
  }

  public async requestAccess(
    context: AuthContext,
    input: AccessRequestInput,
  ): Promise<AccessDecision> {
    if (input.dryRun) {
      return this.simulateAccess(context, input, "dry_run");
    }

    const evaluation = await this.evaluateAccess(context, input, "live");
    if (!evaluation.credential || !evaluation.policyDecision) {
      return evaluation.decision;
    }

    const { credential, policyDecision, correlationId, targetUrl } = evaluation;
    if (!targetUrl) {
      return evaluation.decision;
    }
    const breakGlassGrant = await this.breakGlass.verifyActive(context, input);
    if (breakGlassGrant) {
      await this.breakGlass.recordUse(context, breakGlassGrant);
      return this.executeAllowedRequest(
        "live",
        context,
        input,
        credential,
        { decision: "allow", reason: "Emergency break-glass grant is active.", ruleId: undefined },
        correlationId,
        targetUrl,
        breakGlassGrant,
      );
    }

    if (policyDecision.decision === "deny") {
      if (input.breakGlassId) {
        return this.toBreakGlassDeniedDecision("live", correlationId, credential);
      }
      return this.toDeniedDecision("live", correlationId, credential, policyDecision);
    }

    if (policyDecision.decision === "approval") {
      const approved = await this.approvals.verifyApproval(context, input);
      if (approved) {
        return this.executeAllowedRequest(
          "live",
          context,
          input,
          credential,
          policyDecision,
          correlationId,
          targetUrl,
        );
      }

      if (input.breakGlassId) {
        return this.toBreakGlassDeniedDecision("live", correlationId, credential);
      }

      const approval = await this.approvals.createPending(context, input, {
        reason: policyDecision.reason,
        ruleId: policyDecision.ruleId,
        correlationId,
      });
      return this.toApprovalRequiredDecision("live", correlationId, credential, policyDecision, approval);
    }

    return this.executeAllowedRequest(
      "live",
      context,
      input,
      credential,
      policyDecision,
      correlationId,
      targetUrl,
    );
  }

  public async simulateAccess(
    context: AuthContext,
    input: AccessRequestInput,
    mode: "dry_run" | "simulation" = "simulation",
  ): Promise<AccessDecision> {
    const evaluation = await this.evaluateAccess(context, input, mode);
    if (!evaluation.credential || !evaluation.policyDecision) {
      return evaluation.decision;
    }

    const { credential, policyDecision, correlationId } = evaluation;
    const breakGlassGrant = await this.breakGlass.verifyActive(context, input);
    if (breakGlassGrant) {
      return this.toAllowedDecision(mode, correlationId, credential, {
        decision: "allow",
        reason: "Emergency break-glass grant is active.",
        ruleId: undefined,
      });
    }

    if (policyDecision.decision === "deny") {
      if (input.breakGlassId) {
        return this.toBreakGlassDeniedDecision(mode, correlationId, credential);
      }
      return this.toDeniedDecision(mode, correlationId, credential, policyDecision);
    }

    if (policyDecision.decision === "approval") {
      const approved = await this.approvals.verifyApproval(context, input);
      if (approved) {
        return this.toAllowedDecision(mode, correlationId, credential, policyDecision);
      }

      if (input.breakGlassId) {
        return this.toBreakGlassDeniedDecision(mode, correlationId, credential);
      }

      return this.toApprovalRequiredDecision(mode, correlationId, credential, policyDecision);
    }

    return this.toAllowedDecision(mode, correlationId, credential, policyDecision);
  }

  private async evaluateAccess(
    context: AuthContext,
    input: AccessRequestInput,
    mode: AccessMode,
  ): Promise<{
    correlationId: string;
    credential?: CredentialRecord;
    decision: AccessDecision;
    policyDecision?: PolicyDecision;
    targetUrl?: URL;
  }> {
    const correlationId = randomUUID();
    const credential = await this.credentials.getById(input.credentialId);
    const action =
      mode === "simulation"
        ? "access.simulate"
        : mode === "dry_run"
          ? "access.dry_run"
          : "access.request";

    if (!credential) {
      await this.audit.record({
        type: "authz.decision",
        action,
        outcome: "denied",
        principal: context.principal,
        correlationId,
        metadata: {
          credentialId: input.credentialId,
          reason: "Credential not found.",
          mode,
        },
      });

      return {
        correlationId,
        decision: {
          decision: "denied",
          mode,
          reason: "Credential not found.",
          correlationId,
        },
      };
    }

    let targetUrl: URL;
    try {
      targetUrl = await this.validateTarget(input.targetUrl, this.config);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Target is blocked by egress policy.";
      await this.audit.record({
        type: "authz.decision",
        action,
        outcome: "denied",
        principal: context.principal,
        correlationId,
        metadata: {
          credentialId: credential.id,
          operation: input.operation,
          targetUrl: input.targetUrl,
          reason,
          mode,
          dryRun: mode !== "live",
        },
      });

      return {
        correlationId,
        credential,
        decision: {
          decision: "denied",
          mode,
          reason,
          correlationId,
          credential: summarizeCredential(credential),
        },
      };
    }

    const policies = await this.policies.read();
    const decision = this.policyEngine.evaluate(
      policies,
      context.principal,
      context.roles,
      credential,
      input.operation,
      targetUrl.hostname,
      this.config.environment,
    );

    await this.audit.record({
      type: "authz.decision",
      action,
      outcome: decision.decision === "allow" ? "allowed" : "denied",
      principal: context.principal,
      correlationId,
      metadata: {
        credentialId: credential.id,
        operation: input.operation,
        targetHost: targetUrl.hostname,
        ruleId: decision.ruleId ?? null,
        reason: decision.reason,
        mode,
        dryRun: mode !== "live",
      },
    });

    return {
      correlationId,
      credential,
      policyDecision: decision,
      targetUrl,
      decision: this.toAllowedDecision(mode, correlationId, credential, decision),
    };
  }

  public async listRecentAuditEvents(limit = 20) {
    return this.audit.listRecent(limit);
  }

  public async listCredentialReports(
    context: AuthContext,
    id?: string,
  ): Promise<CredentialStatusReport[]> {
    const credentials = id
      ? ((await this.credentials.getById(id)) ? [await this.credentials.getById(id)] : [])
      : await this.credentials.list();

    return Promise.all(
      credentials.filter(Boolean).map(async (credential) => ({
        credential: summarizeCredential(credential as CredentialRecord),
        runtimeMode:
          (credential as CredentialRecord).binding.injectionEnvName ? "sandbox_injection" : "proxy",
        catalogExpiresAt: (credential as CredentialRecord).expiresAt,
        daysUntilCatalogExpiry: daysUntil((credential as CredentialRecord).expiresAt),
        inspection: await this.adapters.inspectCredential(credential as CredentialRecord),
      })),
    );
  }

  public async adapterHealth(): Promise<AdapterHealth[]> {
    return this.adapters.healthchecks();
  }

  public async listApprovalRequests(status?: ApprovalRequest["status"]) {
    return this.approvals.list(status);
  }

  public async reviewApprovalRequest(
    context: AuthContext,
    id: string,
    status: "approved" | "denied",
    note?: string,
  ) {
    return this.approvals.review(id, context, status, note);
  }

  public async createBreakGlassRequest(
    context: AuthContext,
    input: Parameters<typeof breakGlassRequestInputSchema.parse>[0],
  ) {
    const parsed = breakGlassRequestInputSchema.parse(input);
    const credential = await this.credentials.getById(parsed.credentialId);
    if (!credential) {
      throw new Error("Credential not found.");
    }

    await this.validateTarget(parsed.targetUrl, this.config);
    return this.breakGlass.createRequest(context, parsed);
  }

  public async listBreakGlassRequests(filter?: {
    status?: BreakGlassRequest["status"];
    requestedBy?: string;
  }) {
    return this.breakGlass.list(filter);
  }

  public async reviewBreakGlassRequest(
    context: AuthContext,
    id: string,
    status: "active" | "denied",
    note?: string,
  ) {
    return this.breakGlass.review(id, context, status, note);
  }

  public async revokeBreakGlassRequest(
    context: AuthContext,
    id: string,
    note?: string,
  ) {
    return this.breakGlass.revoke(id, context, note);
  }

  public async runSandboxed(
    context: AuthContext,
    input: RuntimeExecutionInput,
  ): Promise<RuntimeExecutionResult> {
    const credential = await this.credentials.getById(input.credentialId);
    if (!credential) {
      throw new Error("Credential not found.");
    }

    const resolved = await this.adapters.resolve(credential);
    const secretEnvName = input.secretEnvName ?? credential.binding.injectionEnvName;
    if (!secretEnvName) {
      throw new Error("Sandbox execution requires secretEnvName or credential.binding.injectionEnvName.");
    }

    const result = await this.sandbox.run(input, resolved.secret, secretEnvName);
    await this.audit.record({
      type: "runtime.exec",
      action: "runtime.exec",
      outcome: result.exitCode === 0 ? "success" : "error",
      principal: context.principal,
      metadata: {
        credentialId: credential.id,
        command: input.command,
        args: input.args,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
      },
    });

    return result;
  }

  private async executeAllowedRequest(
    mode: AccessMode,
    context: AuthContext,
    input: AccessRequestInput,
    credential: CredentialRecord,
    decision: PolicyDecision,
    correlationId: string,
    targetUrl: URL,
    breakGlassGrant?: BreakGlassRequest,
  ): Promise<AccessDecision> {
    const resolved = await this.adapters.resolve(credential);
    const httpResult = await this.executeProxyRequest(input, targetUrl, resolved.secret, {
      [resolved.headerName]: resolved.headerValue,
    });

    await this.audit.record({
      type: "credential.use",
      action: "proxy.http",
      outcome: "success",
      principal: context.principal,
      correlationId,
      metadata: {
        credentialId: credential.id,
        operation: input.operation,
        targetHost: targetUrl.hostname,
        ruleId: decision.ruleId ?? null,
        status: httpResult.status,
        breakGlassId: breakGlassGrant?.id ?? null,
      },
    });

    return {
      decision: "allowed",
      mode,
      reason: decision.reason,
      correlationId,
      credential: summarizeCredential(credential),
      ruleId: decision.ruleId,
      httpResult,
    };
  }

  private toBreakGlassDeniedDecision(
    mode: AccessMode,
    correlationId: string,
    credential: CredentialRecord,
  ): AccessDecision {
    return {
      decision: "denied",
      mode,
      reason: "Break-glass grant is invalid, expired, or does not match this request.",
      correlationId,
      credential: summarizeCredential(credential),
    };
  }

  private toDeniedDecision(
    mode: AccessMode,
    correlationId: string,
    credential: CredentialRecord,
    decision: PolicyDecision,
  ): AccessDecision {
    return {
      decision: "denied",
      mode,
      reason: decision.reason,
      correlationId,
      credential: summarizeCredential(credential),
      ruleId: decision.ruleId,
    };
  }

  private toAllowedDecision(
    mode: AccessMode,
    correlationId: string,
    credential: CredentialRecord,
    decision: PolicyDecision,
  ): AccessDecision {
    return {
      decision: "allowed",
      mode,
      reason: decision.reason,
      correlationId,
      credential: summarizeCredential(credential),
      ruleId: decision.ruleId,
    };
  }

  private toApprovalRequiredDecision(
    mode: AccessMode,
    correlationId: string,
    credential: CredentialRecord,
    decision: PolicyDecision,
    approval?: ApprovalRequest,
  ): AccessDecision {
    if (approval) {
      approvalRequestSchema.parse(approval);
    }
    return {
      decision: "approval_required",
      mode,
      reason: decision.reason,
      correlationId,
      credential: summarizeCredential(credential),
      ruleId: decision.ruleId,
      approvalRequestId: approval?.id,
    };
  }

  private async executeProxyRequest(
    input: AccessRequestInput,
    targetUrl: URL,
    secret: string,
    authHeaders: Record<string, string>,
  ): Promise<NonNullable<AccessDecision["httpResult"]>> {
    const userHeaders = sanitizeHeaders(input.headers);
    const requestInit: RequestInit = {
      method: methodForOperation(input.operation),
      headers: {
        accept: "application/json, text/plain;q=0.9, */*;q=0.8",
        ...userHeaders,
        ...authHeaders,
      },
      signal: AbortSignal.timeout(this.config.outboundTimeoutMs),
    };

    if (input.operation === "http.post" && input.payload) {
      requestInit.body = input.payload;
    }

    const response = await fetch(targetUrl, requestInit);
    const limitedBody = await readLimitedResponseBody(response, this.config.maxResponseBytes);
    const redactedText = redactText(limitedBody.text, secret);
    const truncated = truncate(redactedText, this.config.maxResponseBytes);

    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyPreview: truncated.text,
      bodyTruncated: limitedBody.truncated || truncated.truncated,
    };
  }
}
