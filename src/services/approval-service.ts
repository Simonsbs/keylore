import { randomUUID, createHash } from "node:crypto";

import { AccessRequestInput, ApprovalRequest, approvalRequestSchema, AuthContext } from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { ApprovalRepository } from "../repositories/interfaces.js";

function fingerprint(context: AuthContext, input: AccessRequestInput): string {
  const serialized = JSON.stringify({
    principal: context.principal,
    credentialId: input.credentialId,
    operation: input.operation,
    targetUrl: input.targetUrl,
    headers: input.headers ?? {},
    payload: input.payload ?? "",
  });
  return createHash("sha256").update(serialized).digest("hex");
}

export class ApprovalService {
  public constructor(
    private readonly approvals: ApprovalRepository,
    private readonly audit: PgAuditLogService,
    private readonly approvalTtlSeconds: number,
  ) {}

  public async createPending(
    context: AuthContext,
    input: AccessRequestInput,
    decision: { reason: string; ruleId?: string; correlationId: string },
  ): Promise<ApprovalRequest> {
    const request = approvalRequestSchema.parse({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.approvalTtlSeconds * 1000).toISOString(),
      status: "pending",
      requestedBy: context.principal,
      requestedRoles: context.roles,
      credentialId: input.credentialId,
      operation: input.operation,
      targetUrl: input.targetUrl,
      targetHost: new URL(input.targetUrl).hostname,
      reason: decision.reason,
      ruleId: decision.ruleId,
      correlationId: decision.correlationId,
      fingerprint: fingerprint(context, input),
    });
    const created = await this.approvals.create(request);
    await this.audit.record({
      type: "approval.request",
      action: "approval.request",
      outcome: "success",
      principal: context.principal,
      correlationId: decision.correlationId,
      metadata: {
        approvalId: created.id,
        credentialId: created.credentialId,
        operation: created.operation,
        targetHost: created.targetHost,
        ruleId: created.ruleId ?? null,
      },
    });
    return created;
  }

  public async verifyApproval(
    context: AuthContext,
    input: AccessRequestInput,
  ): Promise<ApprovalRequest | undefined> {
    await this.approvals.expireStale();
    if (!input.approvalId) {
      return undefined;
    }

    const approval = await this.approvals.getById(input.approvalId);
    if (!approval || approval.status !== "approved") {
      return undefined;
    }

    if (new Date(approval.expiresAt).getTime() <= Date.now()) {
      return undefined;
    }

    return approval.fingerprint === fingerprint(context, input) ? approval : undefined;
  }

  public async list(status?: ApprovalRequest["status"]) {
    await this.approvals.expireStale();
    return this.approvals.list(status);
  }

  public async review(
    id: string,
    context: AuthContext,
    status: "approved" | "denied",
    note?: string,
  ) {
    await this.approvals.expireStale();
    const reviewed = await this.approvals.review(id, {
      status,
      reviewedBy: context.principal,
      reviewNote: note,
    });
    if (reviewed) {
      await this.audit.record({
        type: "approval.review",
        action: `approval.${status}`,
        outcome: status === "approved" ? "allowed" : "denied",
        principal: context.principal,
        correlationId: reviewed.correlationId,
        metadata: {
          approvalId: reviewed.id,
          credentialId: reviewed.credentialId,
          requestedBy: reviewed.requestedBy,
          reviewNote: reviewed.reviewNote ?? null,
        },
      });
    }
    return reviewed;
  }
}
