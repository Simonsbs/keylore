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

export class BreakGlassService {
  public constructor(
    private readonly requests: BreakGlassRepository,
    private readonly audit: PgAuditLogService,
    private readonly maxDurationSeconds: number,
  ) {}

  public async createRequest(
    context: AuthContext,
    input: Parameters<typeof breakGlassRequestInputSchema.parse>[0],
  ): Promise<BreakGlassRequest> {
    const parsedInput = breakGlassRequestInputSchema.parse(input);
    const requestedDurationSeconds = Math.min(
      parsedInput.requestedDurationSeconds ?? this.maxDurationSeconds,
      this.maxDurationSeconds,
    );
    const created = await this.requests.create(
      breakGlassRequestSchema.parse({
        id: randomUUID(),
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
      }),
    );

    await this.audit.record({
      type: "breakglass.request",
      action: "breakglass.request",
      outcome: "success",
      principal: context.principal,
      correlationId: created.correlationId,
      metadata: {
        breakGlassId: created.id,
        credentialId: created.credentialId,
        operation: created.operation,
        targetHost: created.targetHost,
        requestedDurationSeconds: created.requestedDurationSeconds,
      },
    });

    return created;
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

    if (new Date(request.expiresAt).getTime() <= Date.now()) {
      return undefined;
    }

    return request.fingerprint === accessFingerprint(context, input) ? request : undefined;
  }

  public async list(filter?: {
    status?: BreakGlassRequest["status"];
    requestedBy?: string;
  }): Promise<BreakGlassRequest[]> {
    await this.requests.expireStale();
    return this.requests.list(filter);
  }

  public async review(
    id: string,
    context: AuthContext,
    status: "active" | "denied",
    note?: string,
  ): Promise<BreakGlassRequest | undefined> {
    await this.requests.expireStale();
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
        principal: context.principal,
        correlationId: reviewed.correlationId,
        metadata: {
          breakGlassId: reviewed.id,
          credentialId: reviewed.credentialId,
          requestedBy: reviewed.requestedBy,
          reviewNote: reviewed.reviewNote ?? null,
        },
      });
    }

    return reviewed;
  }

  public async revoke(
    id: string,
    context: AuthContext,
    note?: string,
  ): Promise<BreakGlassRequest | undefined> {
    await this.requests.expireStale();
    const revoked = await this.requests.revoke(id, {
      revokedBy: context.principal,
      revokeNote: note,
    });

    if (revoked) {
      await this.audit.record({
        type: "breakglass.review",
        action: "breakglass.revoke",
        outcome: "denied",
        principal: context.principal,
        correlationId: revoked.correlationId,
        metadata: {
          breakGlassId: revoked.id,
          credentialId: revoked.credentialId,
          requestedBy: revoked.requestedBy,
          revokeNote: revoked.revokeNote ?? null,
        },
      });
    }

    return revoked;
  }

  public async recordUse(
    context: AuthContext,
    request: BreakGlassRequest,
  ): Promise<void> {
    await this.audit.record({
      type: "breakglass.use",
      action: "breakglass.use",
      outcome: "allowed",
      principal: context.principal,
      correlationId: request.correlationId,
      metadata: {
        breakGlassId: request.id,
        credentialId: request.credentialId,
        targetHost: request.targetHost,
      },
    });
  }
}
