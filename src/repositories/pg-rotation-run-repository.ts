import { RotationRun, rotationRunSchema } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { RotationRunRepository } from "./interfaces.js";

interface RotationRunRow {
  id: string;
  tenant_id: string;
  credential_id: string;
  status: RotationRun["status"];
  source: RotationRun["source"];
  reason: string;
  due_at: string | Date | null;
  planned_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  planned_by: string;
  updated_by: string;
  note: string | null;
  target_ref: string | null;
  result_note: string | null;
}

function toIso(value: string | Date | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: RotationRunRow): RotationRun {
  return rotationRunSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    credentialId: row.credential_id,
    status: row.status,
    source: row.source,
    reason: row.reason,
    dueAt: toIso(row.due_at),
    plannedAt: toIso(row.planned_at),
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    plannedBy: row.planned_by,
    updatedBy: row.updated_by,
    note: row.note ?? undefined,
    targetRef: row.target_ref ?? undefined,
    resultNote: row.result_note ?? undefined,
  });
}

export class PgRotationRunRepository implements RotationRunRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async create(input: RotationRun): Promise<RotationRun> {
    const parsed = rotationRunSchema.parse(input);
    const result = await this.database.query<RotationRunRow>(
      `INSERT INTO rotation_runs (
         id, tenant_id, credential_id, status, source, reason, due_at, planned_at, started_at,
         completed_at, planned_by, updated_by, note, target_ref, result_note
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9,
         $10, $11, $12, $13, $14, $15
       )
       RETURNING *`,
      [
        parsed.id,
        parsed.tenantId,
        parsed.credentialId,
        parsed.status,
        parsed.source,
        parsed.reason,
        parsed.dueAt ?? null,
        parsed.plannedAt,
        parsed.startedAt ?? null,
        parsed.completedAt ?? null,
        parsed.plannedBy,
        parsed.updatedBy,
        parsed.note ?? null,
        parsed.targetRef ?? null,
        parsed.resultNote ?? null,
      ],
    );
    return mapRow(result.rows[0]!);
  }

  public async getById(id: string): Promise<RotationRun | undefined> {
    const result = await this.database.query<RotationRunRow>(
      "SELECT * FROM rotation_runs WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async list(filter?: {
    status?: RotationRun["status"];
    credentialId?: string;
    tenantId?: string;
  }): Promise<RotationRun[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter?.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }

    if (filter?.credentialId) {
      params.push(filter.credentialId);
      clauses.push(`credential_id = $${params.length}`);
    }

    if (filter?.tenantId) {
      params.push(filter.tenantId);
      clauses.push(`tenant_id = $${params.length}`);
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.database.query<RotationRunRow>(
      `SELECT * FROM rotation_runs ${whereClause} ORDER BY planned_at DESC, id DESC`,
      params,
    );
    return result.rows.map((row) => mapRow(row));
  }

  public async findOpenByCredentialId(credentialId: string): Promise<RotationRun | undefined> {
    const result = await this.database.query<RotationRunRow>(
      `SELECT * FROM rotation_runs
       WHERE credential_id = $1
         AND status IN ('pending', 'in_progress')
       ORDER BY planned_at DESC
       LIMIT 1`,
      [credentialId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async transition(
    id: string,
    update: {
      fromStatuses: RotationRun["status"][];
      status: RotationRun["status"];
      updatedBy: string;
      note?: string;
      targetRef?: string;
      resultNote?: string;
    },
  ): Promise<RotationRun | undefined> {
    return this.database.withTransaction(async (client) => {
      const existingResult = await client.query<RotationRunRow>(
        "SELECT * FROM rotation_runs WHERE id = $1 FOR UPDATE",
        [id],
      );
      const existing = existingResult.rows[0];
      if (!existing || !update.fromStatuses.includes(existing.status)) {
        return undefined;
      }

      const startedAt =
        update.status === "in_progress"
          ? new Date().toISOString()
          : toIso(existing.started_at) ?? null;
      const completedAt =
        update.status === "completed" || update.status === "failed" || update.status === "cancelled"
          ? new Date().toISOString()
          : null;

      const result = await client.query<RotationRunRow>(
        `UPDATE rotation_runs
         SET status = $2,
             started_at = $3,
             completed_at = $4,
             updated_by = $5,
             note = COALESCE($6, note),
             target_ref = COALESCE($7, target_ref),
             result_note = COALESCE($8, result_note),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [
          id,
          update.status,
          startedAt,
          completedAt,
          update.updatedBy,
          update.note ?? null,
          update.targetRef ?? null,
          update.resultNote ?? null,
        ],
      );
      return result.rows[0] ? mapRow(result.rows[0]) : undefined;
    });
  }
}
