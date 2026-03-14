import { randomUUID } from "node:crypto";

import { SecretAdapterRegistry } from "../adapters/adapter-registry.js";
import {
  AuthContext,
  CredentialRecord,
  RotationRun,
  rotationCreateInputSchema,
  rotationPlanInputSchema,
  rotationRunSchema,
} from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { CredentialRepository, RotationRunRepository } from "../repositories/interfaces.js";
import { NotificationService } from "./notification-service.js";
import { TraceService } from "./trace-service.js";

function earliestDueDate(values: Array<string | null | undefined>): string | undefined {
  const parsed = values
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((value) => !Number.isNaN(value.getTime()))
    .sort((left, right) => left.getTime() - right.getTime());
  return parsed[0]?.toISOString();
}

function dueSource(
  credential: CredentialRecord,
  inspection: {
    expiresAt?: string;
    nextRotationAt?: string;
  },
): RotationRun["source"] | undefined {
  if (inspection.nextRotationAt) {
    return "secret_rotation_window";
  }
  if (inspection.expiresAt) {
    return "secret_expiry";
  }
  if (credential.expiresAt) {
    return "catalog_expiry";
  }
  return undefined;
}

export class RotationService {
  public constructor(
    private readonly runs: RotationRunRepository,
    private readonly credentials: CredentialRepository,
    private readonly adapters: SecretAdapterRegistry,
    private readonly audit: PgAuditLogService,
    private readonly notifications: NotificationService,
    private readonly traces: TraceService,
    private readonly defaultHorizonDays: number,
  ) {}

  private async createRun(input: RotationRun, actor: AuthContext): Promise<RotationRun> {
    const created = await this.runs.create(rotationRunSchema.parse(input));
    await this.audit.record({
      type: "rotation.run",
      action: "rotation.create",
      outcome: "success",
      principal: actor.principal,
      metadata: {
        rotationId: created.id,
        credentialId: created.credentialId,
        source: created.source,
        dueAt: created.dueAt ?? null,
      },
    });
    await this.notifications.send("rotation.created", {
      rotationId: created.id,
      credentialId: created.credentialId,
      source: created.source,
      dueAt: created.dueAt ?? null,
    });
    return created;
  }

  public async list(filter?: {
    status?: RotationRun["status"];
    credentialId?: string;
  }): Promise<RotationRun[]> {
    return this.runs.list(filter);
  }

  public async createManual(context: AuthContext, input: unknown): Promise<RotationRun> {
    const parsed = rotationCreateInputSchema.parse(input);
    return this.traces.withSpan("rotation.create_manual", { credentialId: parsed.credentialId }, async () => {
      const credential = await this.credentials.getById(parsed.credentialId);
      if (!credential) {
        throw new Error("Credential not found.");
      }
      const existing = await this.runs.findOpenByCredentialId(parsed.credentialId);
      if (existing) {
        throw new Error("An open rotation already exists for this credential.");
      }
      return this.createRun(
        {
          id: randomUUID(),
          credentialId: parsed.credentialId,
          status: "pending",
          source: "manual",
          reason: parsed.reason,
          dueAt: parsed.dueAt,
          plannedAt: new Date().toISOString(),
          plannedBy: context.principal,
          updatedBy: context.principal,
          note: parsed.note,
        },
        context,
      );
    });
  }

  public async planDue(context: AuthContext, input?: unknown): Promise<RotationRun[]> {
    const parsed = rotationPlanInputSchema.parse(input ?? { horizonDays: this.defaultHorizonDays });
    return this.traces.withSpan("rotation.plan_due", { horizonDays: parsed.horizonDays }, async () => {
      const credentials = await this.credentials.list();
      const cutoff = Date.now() + parsed.horizonDays * 24 * 60 * 60 * 1000;
      const created: RotationRun[] = [];

      for (const credential of credentials) {
        if (credential.status !== "active") {
          continue;
        }
        if (parsed.credentialIds?.length && !parsed.credentialIds.includes(credential.id)) {
          continue;
        }
        if (await this.runs.findOpenByCredentialId(credential.id)) {
          continue;
        }

        const inspection = await this.adapters.inspectCredential(credential);
        const dueAt = earliestDueDate([
          credential.expiresAt,
          inspection.expiresAt,
          inspection.nextRotationAt,
        ]);
        if (!dueAt || new Date(dueAt).getTime() > cutoff) {
          continue;
        }

        const source = dueSource(credential, inspection);
        if (!source) {
          continue;
        }

        created.push(
          await this.createRun(
            {
              id: randomUUID(),
              credentialId: credential.id,
              status: "pending",
              source,
              reason:
                source === "catalog_expiry"
                  ? "Credential catalogue expiry is approaching."
                  : source === "secret_expiry"
                    ? "Secret backend reports upcoming expiry."
                    : "Secret backend reports upcoming rotation window.",
              dueAt,
              plannedAt: new Date().toISOString(),
              plannedBy: context.principal,
              updatedBy: context.principal,
            },
            context,
          ),
        );
      }

      return created;
    });
  }

  public async start(id: string, context: AuthContext, note?: string): Promise<RotationRun | undefined> {
    return this.traces.withSpan("rotation.start", { rotationId: id }, async () => {
      const updated = await this.runs.transition(id, {
        fromStatuses: ["pending"],
        status: "in_progress",
        updatedBy: context.principal,
        note,
      });
      if (updated) {
        await this.audit.record({
          type: "rotation.run",
          action: "rotation.start",
          outcome: "success",
          principal: context.principal,
          metadata: {
            rotationId: updated.id,
            credentialId: updated.credentialId,
          },
        });
        await this.notifications.send("rotation.started", {
          rotationId: updated.id,
          credentialId: updated.credentialId,
        });
      }
      return updated;
    });
  }

  public async complete(
    id: string,
    context: AuthContext,
    input: {
      note?: string;
      targetRef?: string;
      expiresAt?: string | null;
      lastValidatedAt?: string;
    },
  ): Promise<RotationRun | undefined> {
    return this.traces.withSpan("rotation.complete", { rotationId: id }, async () => {
      const run = await this.runs.getById(id);
      if (!run) {
        return undefined;
      }
      const credential = await this.credentials.getById(run.credentialId);
      if (!credential) {
        throw new Error("Credential not found.");
      }

      const nextLastValidatedAt = input.lastValidatedAt ?? new Date().toISOString();
      const nextBinding =
        input.targetRef && input.targetRef !== credential.binding.ref
          ? { ...credential.binding, ref: input.targetRef }
          : undefined;
      await this.credentials.update(credential.id, {
        lastValidatedAt: nextLastValidatedAt,
        expiresAt: input.expiresAt ?? credential.expiresAt,
        ...(nextBinding ? { binding: nextBinding } : {}),
      });

      const updated = await this.runs.transition(id, {
        fromStatuses: ["pending", "in_progress"],
        status: "completed",
        updatedBy: context.principal,
        note: input.note,
        targetRef: input.targetRef,
        resultNote: input.note,
      });
      if (updated) {
        await this.audit.record({
          type: "rotation.run",
          action: "rotation.complete",
          outcome: "success",
          principal: context.principal,
          metadata: {
            rotationId: updated.id,
            credentialId: updated.credentialId,
            targetRef: updated.targetRef ?? null,
          },
        });
        await this.notifications.send("rotation.completed", {
          rotationId: updated.id,
          credentialId: updated.credentialId,
          targetRef: updated.targetRef ?? null,
        });
      }
      return updated;
    });
  }

  public async fail(id: string, context: AuthContext, note?: string): Promise<RotationRun | undefined> {
    return this.traces.withSpan("rotation.fail", { rotationId: id }, async () => {
      const updated = await this.runs.transition(id, {
        fromStatuses: ["pending", "in_progress"],
        status: "failed",
        updatedBy: context.principal,
        note,
        resultNote: note,
      });
      if (updated) {
        await this.audit.record({
          type: "rotation.run",
          action: "rotation.fail",
          outcome: "error",
          principal: context.principal,
          metadata: {
            rotationId: updated.id,
            credentialId: updated.credentialId,
          },
        });
        await this.notifications.send("rotation.failed", {
          rotationId: updated.id,
          credentialId: updated.credentialId,
        });
      }
      return updated;
    });
  }
}
