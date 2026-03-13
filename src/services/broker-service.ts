import { randomUUID } from "node:crypto";

import {
  AccessRequestInput,
  CatalogSearchInput,
  CredentialRecord,
  CredentialSummary,
  credentialSummarySchema,
} from "../domain/types.js";
import { EnvSecretAdapter } from "../adapters/env-secret-adapter.js";
import { KeyLoreConfig } from "../config.js";
import { JsonCredentialRepository } from "../repositories/credential-repository.js";
import { JsonPolicyRepository } from "../repositories/policy-repository.js";
import { AuditLogService } from "./audit-log.js";
import { PolicyDecision, PolicyEngine } from "./policy-engine.js";

export interface AccessDecision extends Record<string, unknown> {
  decision: "allowed" | "denied";
  reason: string;
  correlationId: string;
  credential: CredentialSummary | undefined;
  ruleId: string | undefined;
  httpResult:
    | {
    status: number;
    contentType: string | null;
    bodyPreview: string;
    bodyTruncated: boolean;
  }
    | undefined;
}

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
  if (operation === "http.post") {
    return "POST";
  }

  return "GET";
}

export class BrokerService {
  public constructor(
    private readonly credentials: JsonCredentialRepository,
    private readonly policies: JsonPolicyRepository,
    private readonly audit: AuditLogService,
    private readonly adapter: EnvSecretAdapter,
    private readonly policyEngine: PolicyEngine,
    private readonly config: KeyLoreConfig,
  ) {}

  public async searchCatalog(
    principal: string,
    input: CatalogSearchInput,
  ): Promise<CredentialSummary[]> {
    const correlationId = randomUUID();
    const results = (await this.credentials.search(input)).map(summarizeCredential);

    await this.audit.record({
      type: "catalog.search",
      action: "catalog.search",
      outcome: "success",
      principal,
      correlationId,
      metadata: {
        query: input.query ?? null,
        filters: input,
        resultCount: results.length,
      },
    });

    return results;
  }

  public async listCredentials(principal: string): Promise<CredentialSummary[]> {
    return this.searchCatalog(principal, { limit: 50 });
  }

  public async getCredential(
    principal: string,
    id: string,
  ): Promise<CredentialSummary | undefined> {
    const correlationId = randomUUID();
    const credential = await this.credentials.getById(id);

    await this.audit.record({
      type: "catalog.read",
      action: "catalog.get",
      outcome: credential ? "success" : "error",
      principal,
      correlationId,
      metadata: {
        credentialId: id,
        found: Boolean(credential),
      },
    });

    return credential ? summarizeCredential(credential) : undefined;
  }

  public async createCredential(principal: string, credential: CredentialRecord): Promise<CredentialRecord> {
    const created = await this.credentials.create(credential);

    await this.audit.record({
      type: "catalog.write",
      action: "catalog.create",
      outcome: "success",
      principal,
      metadata: {
        credentialId: created.id,
        service: created.service,
      },
    });

    return created;
  }

  public async updateCredential(
    principal: string,
    id: string,
    patch: Partial<Omit<CredentialRecord, "id">>,
  ): Promise<CredentialRecord> {
    const updated = await this.credentials.update(id, patch);

    await this.audit.record({
      type: "catalog.write",
      action: "catalog.update",
      outcome: "success",
      principal,
      metadata: {
        credentialId: id,
        fields: Object.keys(patch),
      },
    });

    return updated;
  }

  public async deleteCredential(principal: string, id: string): Promise<boolean> {
    const deleted = await this.credentials.delete(id);

    await this.audit.record({
      type: "catalog.write",
      action: "catalog.delete",
      outcome: deleted ? "success" : "error",
      principal,
      metadata: {
        credentialId: id,
      },
    });

    return deleted;
  }

  public async requestAccess(
    principal: string,
    input: AccessRequestInput,
  ): Promise<AccessDecision> {
    const correlationId = randomUUID();
    const credential = await this.credentials.getById(input.credentialId);

    if (!credential) {
      await this.audit.record({
        type: "authz.decision",
        action: "access.request",
        outcome: "denied",
        principal,
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
        credential: undefined,
        ruleId: undefined,
        httpResult: undefined,
      };
    }

    const targetUrl = validateTargetUrl(input.targetUrl);
    const policies = await this.policies.read();
    const decision = this.policyEngine.evaluate(
      policies,
      principal,
      credential,
      input.operation,
      targetUrl.hostname,
      this.config.environment,
    );

    await this.audit.record({
      type: "authz.decision",
      action: "access.request",
      outcome: decision.allowed ? "allowed" : "denied",
      principal,
      correlationId,
      metadata: {
        credentialId: credential.id,
        operation: input.operation,
        targetHost: targetUrl.hostname,
        ruleId: decision.ruleId ?? null,
        reason: decision.reason,
      },
    });

    if (!decision.allowed) {
      return this.toDeniedDecision(correlationId, credential, decision);
    }

    const resolved = await this.adapter.resolve(credential);
    const httpResult = await this.executeProxyRequest(credential, input, targetUrl, resolved.secret, {
      [resolved.headerName]: resolved.headerValue,
    });

    await this.audit.record({
      type: "credential.use",
      action: "proxy.http",
      outcome: "success",
      principal,
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

  public async listRecentAuditEvents(limit = 20) {
    return this.audit.listRecent(limit);
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
      httpResult: undefined,
    };
  }

  private async executeProxyRequest(
    credential: CredentialRecord,
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
    };

    if (input.operation === "http.post" && input.payload) {
      requestInit.body = input.payload;
    }

    const response = await fetch(targetUrl, requestInit);
    const responseText = await response.text();
    const redactedText = redactText(responseText, secret);
    const truncated = truncate(redactedText, 8_000);

    void credential;

    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      bodyPreview: truncated.text,
      bodyTruncated: truncated.truncated,
    };
  }
}
