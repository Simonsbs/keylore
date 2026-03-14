import { randomUUID } from "node:crypto";

import {
  AccessRequestInput,
  AuthContext,
  BreakGlassRequest,
  breakGlassRequestSchema,
  breakGlassRequestInputSchema,
} from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { BreakGlassRepository } from "../repositories/interfaces.js";
import { accessFingerprint } from "./access-fingerprint.js";
import { NotificationService } from "./notification-service.js";
import { TraceService } from "./trace-service.js";

export class BreakGlassService {
  public constructor(
    private readonly requests: BreakGlassRepository,
    private readonly audit: PgAuditLogService,
    private readonly maxDurationSeconds: number,
    private readonly reviewQuorum: number,
    private readonly notifications: NotificationService,
    private readonly traces: TraceService,
  ) {}

  public async createRequest(
    context: AuthContext,
    input: unknown,
    tenantId: string,
  ): Promise<BreakGlassRequest> {
    const parsedInput = breakGlassRequestInputSchema.parse(input);
    return this.traces.withSpan("breakglass.create_request", { credentialId: parsedInput.credentialId }, async () => {
      const requestedDurationSeconds = Math.min(
        parsedInput.requestedDurationSeconds ?? this.maxDurationSeconds,
        this.maxDurationSeconds,
      );
      const created = await this.requests.create(
        breakGlassRequestSchema.parse({
          id: randomUUID(),
          tenantId,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + requestedDurationSeconds * 1000).toISOString(),
          status: "pending",
          requestedBy: context.principal,
          requestedRoles: context.roles,
          credentialId: parsedInput.credentialId,
          operation: parsedInput.operation,
          targetUrl: parsedInput.targetUrl,
          targetHost: new URL(parsedInput.targetUrl).hostname,
          justification: parsedInput.justification,
          requestedDurationSeconds,
          correlationId: randomUUID(),
          fingerprint: accessFingerprint(context, parsedInput),
          requiredApprovals: this.reviewQuorum,
          approvalCount: 0,
          denialCount: 0,
          reviews: [],
        }),
      );

      await this.audit.record({
        type: "breakglass.request",
        action: "breakglass.request",
        outcome: "success",
        tenantId,
        principal: context.principal,
        correlationId: created.correlationId,
        metadata: {
          breakGlassId: created.id,
          tenantId,
          credentialId: created.credentialId,
          operation: created.operation,
          targetHost: created.targetHost,
          requestedDurationSeconds: created.requestedDurationSeconds,
          requiredApprovals: created.requiredApprovals,
        },
      });
      await this.notifications.send("breakglass.pending", {
        breakGlassId: created.id,
        credentialId: created.credentialId,
        requestedBy: created.requestedBy,
        requiredApprovals: created.requiredApprovals,
        targetHost: created.targetHost,
      });

      return created;
    });
  }

  public async verifyActive(
    context: AuthContext,
    input: AccessRequestInput,
  ): Promise<BreakGlassRequest | undefined> {
    await this.requests.expireStale();
    if (!input.breakGlassId) {
      return undefined;
    }

    const request = await this.requests.getById(input.breakGlassId);
    if (!request || request.status !== "active") {
      return undefined;
    }
    if (context.tenantId && request.tenantId !== context.tenantId) {
      return undefined;
    }

    if (new Date(request.expiresAt).getTime() <= Date.now()) {
      return undefined;
    }

    return request.fingerprint === accessFingerprint(context, input) ? request : undefined;
  }

  public async list(context: AuthContext, filter?: {
    status?: BreakGlassRequest["status"];
    requestedBy?: string;
  }): Promise<BreakGlassRequest[]> {
    await this.requests.expireStale();
    return this.requests.list({
      ...filter,
      tenantId: context.tenantId,
    });
  }

  public async review(
    id: string,
    context: AuthContext,
    status: "active" | "denied",
    note?: string,
  ): Promise<BreakGlassRequest | undefined> {
    return this.traces.withSpan("breakglass.review", { breakGlassId: id, decision: status }, async () => {
      await this.requests.expireStale();
      const existing = await this.requests.getById(id);
      if (existing && context.tenantId && existing.tenantId !== context.tenantId) {
        throw new Error("Tenant access denied.");
      }
      const reviewed = await this.requests.review(id, {
        status,
        reviewedBy: context.principal,
        reviewNote: note,
      });

      if (reviewed) {
        await this.audit.record({
          type: "breakglass.review",
          action: `breakglass.${status === "active" ? "approve" : "deny"}`,
          outcome: status === "active" ? "allowed" : "denied",
          tenantId: reviewed.tenantId,
          principal: context.principal,
          correlationId: reviewed.correlationId,
          metadata: {
            breakGlassId: reviewed.id,
            tenantId: reviewed.tenantId,
            credentialId: reviewed.credentialId,
            requestedBy: reviewed.requestedBy,
            reviewNote: reviewed.reviewNote ?? null,
            approvalCount: reviewed.approvalCount,
            denialCount: reviewed.denialCount,
            requiredApprovals: reviewed.requiredApprovals,
            currentStatus: reviewed.status,
          },
        });
        await this.notifications.send("breakglass.reviewed", {
          breakGlassId: reviewed.id,
          credentialId: reviewed.credentialId,
          requestedBy: reviewed.requestedBy,
          reviewer: context.principal,
          decision: status,
          currentStatus: reviewed.status,
          approvalCount: reviewed.approvalCount,
          denialCount: reviewed.denialCount,
          requiredApprovals: reviewed.requiredApprovals,
        });
        if (reviewed.status === "active" || reviewed.status === "denied") {
          await this.notifications.send(`breakglass.${reviewed.status}`, {
            breakGlassId: reviewed.id,
            credentialId: reviewed.credentialId,
            requestedBy: reviewed.requestedBy,
            approvalCount: reviewed.approvalCount,
            denialCount: reviewed.denialCount,
            requiredApprovals: reviewed.requiredApprovals,
          });
        }
      }

      return reviewed;
    });
  }

  public async revoke(
    id: string,
    context: AuthContext,
    note?: string,
  ): Promise<BreakGlassRequest | undefined> {
    return this.traces.withSpan("breakglass.revoke", { breakGlassId: id }, async () => {
      await this.requests.expireStale();
      const existing = await this.requests.getById(id);
      if (existing && context.tenantId && existing.tenantId !== context.tenantId) {
        throw new Error("Tenant access denied.");
      }
      const revoked = await this.requests.revoke(id, {
        revokedBy: context.principal,
        revokeNote: note,
      });

      if (revoked) {
        await this.audit.record({
          type: "breakglass.review",
          action: "breakglass.revoke",
          outcome: "denied",
          tenantId: revoked.tenantId,
          principal: context.principal,
          correlationId: revoked.correlationId,
          metadata: {
            breakGlassId: revoked.id,
            tenantId: revoked.tenantId,
            credentialId: revoked.credentialId,
            requestedBy: revoked.requestedBy,
            revokeNote: revoked.revokeNote ?? null,
          },
        });
        await this.notifications.send("breakglass.revoked", {
          breakGlassId: revoked.id,
          credentialId: revoked.credentialId,
          requestedBy: revoked.requestedBy,
          revokedBy: context.principal,
        });
      }

      return revoked;
    });
  }

  public async recordUse(
    context: AuthContext,
    request: BreakGlassRequest,
  ): Promise<void> {
    await this.traces.withSpan("breakglass.use", { breakGlassId: request.id }, async () => {
      await this.audit.record({
        type: "breakglass.use",
        action: "breakglass.use",
        outcome: "allowed",
        tenantId: request.tenantId,
        principal: context.principal,
        correlationId: request.correlationId,
        metadata: {
          breakGlassId: request.id,
          tenantId: request.tenantId,
          credentialId: request.credentialId,
          targetHost: request.targetHost,
        },
      });
    });
  }
}
