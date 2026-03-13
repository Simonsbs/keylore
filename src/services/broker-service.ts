import { randomUUID } from "node:crypto";

import { EnvSecretAdapter } from "../adapters/env-secret-adapter.js";
import {
  AccessDecision,
  AccessRequestInput,
  ApprovalRequest,
  approvalRequestSchema,
  AuthContext,
  CatalogSearchInput,
  CredentialRecord,
  CredentialSummary,
  credentialSummarySchema,
} from "../domain/types.js";
import { KeyLoreConfig } from "../config.js";
import { CredentialRepository, PolicyRepository } from "../repositories/interfaces.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { ApprovalService } from "./approval-service.js";
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

function validateTargetUrl(rawUrl: string): URL {
  const targetUrl = new URL(rawUrl);
  const isLocalHttp = targetUrl.protocol === "http:" && targetUrl.hostname === "localhost";
  const isLoopbackHttp = targetUrl.protocol === "http:" && targetUrl.hostname === "127.0.0.1";

  if (targetUrl.protocol !== "https:" && !isLocalHttp && !isLoopbackHttp) {
    throw new Error("Only HTTPS targets are allowed, except localhost for local development.");
  }

  return targetUrl;
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
    private readonly adapter: EnvSecretAdapter,
    private readonly policyEngine: PolicyEngine,
    private readonly approvals: ApprovalService,
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
    const correlationId = randomUUID();
    const credential = await this.credentials.getById(input.credentialId);

    if (!credential) {
      await this.audit.record({
        type: "authz.decision",
        action: "access.request",
        outcome: "denied",
        principal: context.principal,
        correlationId,
        metadata: {
          credentialId: input.credentialId,
          reason: "Credential not found.",
        },
      });

      return {
        decision: "denied",
        reason: "Credential not found.",
        correlationId,
      };
    }

    const targetUrl = validateTargetUrl(input.targetUrl);
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
      action: "access.request",
      outcome: decision.decision === "allow" ? "allowed" : "denied",
      principal: context.principal,
      correlationId,
      metadata: {
        credentialId: credential.id,
        operation: input.operation,
        targetHost: targetUrl.hostname,
        ruleId: decision.ruleId ?? null,
        reason: decision.reason,
      },
    });

    if (decision.decision === "deny") {
      return this.toDeniedDecision(correlationId, credential, decision);
    }

    if (decision.decision === "approval") {
      const approved = await this.approvals.verifyApproval(context, input);
      if (approved) {
        return this.executeAllowedRequest(context, input, credential, decision, correlationId);
      }

      const approval = await this.approvals.createPending(context, input, {
        reason: decision.reason,
        ruleId: decision.ruleId,
        correlationId,
      });
      return this.toApprovalRequiredDecision(correlationId, credential, decision, approval);
    }

    return this.executeAllowedRequest(context, input, credential, decision, correlationId);
  }

  public async listRecentAuditEvents(limit = 20) {
    return this.audit.listRecent(limit);
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

  private async executeAllowedRequest(
    context: AuthContext,
    input: AccessRequestInput,
    credential: CredentialRecord,
    decision: PolicyDecision,
    correlationId: string,
  ): Promise<AccessDecision> {
    const targetUrl = validateTargetUrl(input.targetUrl);
    const resolved = await this.adapter.resolve(credential);
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
      },
    });

    return {
      decision: "allowed",
      reason: decision.reason,
      correlationId,
      credential: summarizeCredential(credential),
      ruleId: decision.ruleId,
      httpResult,
    };
  }

  private toDeniedDecision(
    correlationId: string,
    credential: CredentialRecord,
    decision: PolicyDecision,
  ): AccessDecision {
    return {
      decision: "denied",
      reason: decision.reason,
      correlationId,
      credential: summarizeCredential(credential),
      ruleId: decision.ruleId,
    };
  }

  private toApprovalRequiredDecision(
    correlationId: string,
    credential: CredentialRecord,
    decision: PolicyDecision,
    approval: ApprovalRequest,
  ): AccessDecision {
    approvalRequestSchema.parse(approval);
    return {
      decision: "approval_required",
      reason: decision.reason,
      correlationId,
      credential: summarizeCredential(credential),
      ruleId: decision.ruleId,
      approvalRequestId: approval.id,
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
