import { randomUUID } from "node:crypto";

import { AuditEvent, auditEventSchema } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";

export interface RecordAuditInput {
  tenantId?: string;
  type: AuditEvent["type"];
  action: string;
  outcome: AuditEvent["outcome"];
  principal: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

interface AuditRow {
  event_id: string;
  occurred_at: string | Date;
  tenant_id: string;
  type: AuditEvent["type"];
  action: string;
  outcome: AuditEvent["outcome"];
  principal: string;
  correlation_id: string;
  metadata: Record<string, unknown>;
}

function mapRow(row: AuditRow): AuditEvent {
  return auditEventSchema.parse({
    eventId: row.event_id,
    occurredAt:
      row.occurred_at instanceof Date
        ? row.occurred_at.toISOString()
        : row.occurred_at,
    tenantId: row.tenant_id,
    type: row.type,
    action: row.action,
    outcome: row.outcome,
    principal: row.principal,
    correlationId: row.correlation_id,
    metadata: row.metadata,
  });
}

export class PgAuditLogService {
  public constructor(private readonly database: SqlDatabase) {}

  public async record(input: RecordAuditInput): Promise<AuditEvent> {
    const event = auditEventSchema.parse({
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      tenantId: input.tenantId ?? "default",
      type: input.type,
      action: input.action,
      outcome: input.outcome,
      principal: input.principal,
      correlationId: input.correlationId ?? randomUUID(),
      metadata: input.metadata ?? {},
    });

    await this.database.query(
      `INSERT INTO audit_events (
        event_id, occurred_at, tenant_id, type, action, outcome, principal, correlation_id, metadata
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
      )`,
      [
        event.eventId,
        event.occurredAt,
        event.tenantId,
        event.type,
        event.action,
        event.outcome,
        event.principal,
        event.correlationId,
        JSON.stringify(event.metadata),
      ],
    );

    return event;
  }

  public async listRecent(limit = 20, tenantId?: string): Promise<AuditEvent[]> {
    const result = tenantId
      ? await this.database.query<AuditRow>(
          `SELECT * FROM audit_events WHERE tenant_id = $2 ORDER BY occurred_at DESC LIMIT $1`,
          [limit, tenantId],
        )
      : await this.database.query<AuditRow>(
          `SELECT * FROM audit_events ORDER BY occurred_at DESC LIMIT $1`,
          [limit],
        );
    return result.rows.map(mapRow);
  }

  public async count(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM audit_events",
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }
}
