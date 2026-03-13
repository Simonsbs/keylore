import { randomUUID } from "node:crypto";

import { AuditEvent, auditEventSchema } from "../domain/types.js";
import { ensureParentDirectory, readTextFile, writeTextFile } from "../repositories/json-file.js";

export interface RecordAuditInput {
  type: AuditEvent["type"];
  action: string;
  outcome: AuditEvent["outcome"];
  principal: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export class AuditLogService {
  public constructor(private readonly filePath: string) {}

  public async record(input: RecordAuditInput): Promise<AuditEvent> {
    const event = auditEventSchema.parse({
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      type: input.type,
      action: input.action,
      outcome: input.outcome,
      principal: input.principal,
      correlationId: input.correlationId ?? randomUUID(),
      metadata: input.metadata ?? {},
    });

    await ensureParentDirectory(this.filePath);
    const existing = (await readTextFile(this.filePath)) ?? "";
    await writeTextFile(this.filePath, `${existing}${JSON.stringify(event)}\n`);
    return event;
  }

  public async listRecent(limit = 20): Promise<AuditEvent[]> {
    const text = await readTextFile(this.filePath);
    if (!text) {
      return [];
    }

    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => auditEventSchema.parse(JSON.parse(line)))
      .slice(-limit)
      .reverse();
  }
}
