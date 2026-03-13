import { ApprovalRequest, approvalRequestSchema } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { ApprovalRepository } from "./interfaces.js";

interface ApprovalRow {
  id: string;
  created_at: string | Date;
  expires_at: string | Date;
  status: ApprovalRequest["status"];
  requested_by: string;
  requested_roles: ApprovalRequest["requestedRoles"];
  credential_id: string;
  operation: ApprovalRequest["operation"];
  target_url: string;
  target_host: string;
  reason: string;
  rule_id: string | null;
  correlation_id: string;
  fingerprint: string;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
}

function toIso(value: string | Date | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ApprovalRow): ApprovalRequest {
  return approvalRequestSchema.parse({
    id: row.id,
    createdAt: toIso(row.created_at),
    expiresAt: toIso(row.expires_at),
    status: row.status,
    requestedBy: row.requested_by,
    requestedRoles: row.requested_roles,
    credentialId: row.credential_id,
    operation: row.operation,
    targetUrl: row.target_url,
    targetHost: row.target_host,
    reason: row.reason,
    ruleId: row.rule_id ?? undefined,
    correlationId: row.correlation_id,
    fingerprint: row.fingerprint,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: toIso(row.reviewed_at),
    reviewNote: row.review_note ?? undefined,
  });
}

export class PgApprovalRepository implements ApprovalRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async create(input: ApprovalRequest): Promise<ApprovalRequest> {
    const parsed = approvalRequestSchema.parse(input);
    await this.database.query(
      `INSERT INTO approval_requests (
        id, created_at, expires_at, status, requested_by, requested_roles,
        credential_id, operation, target_url, target_host, reason, rule_id,
        correlation_id, fingerprint, reviewed_by, reviewed_at, review_note
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17
      )`,
      [
        parsed.id,
        parsed.createdAt,
        parsed.expiresAt,
        parsed.status,
        parsed.requestedBy,
        parsed.requestedRoles,
        parsed.credentialId,
        parsed.operation,
        parsed.targetUrl,
        parsed.targetHost,
        parsed.reason,
        parsed.ruleId ?? null,
        parsed.correlationId,
        parsed.fingerprint,
        parsed.reviewedBy ?? null,
        parsed.reviewedAt ?? null,
        parsed.reviewNote ?? null,
      ],
    );
    return parsed;
  }

  public async expireStale(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `WITH expired AS (
         UPDATE approval_requests
         SET status = 'expired'
         WHERE status = 'pending' AND expires_at <= NOW()
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM expired`,
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async getById(id: string): Promise<ApprovalRequest | undefined> {
    const result = await this.database.query<ApprovalRow>(
      "SELECT * FROM approval_requests WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async list(status?: ApprovalRequest["status"]): Promise<ApprovalRequest[]> {
    const result = status
      ? await this.database.query<ApprovalRow>(
          "SELECT * FROM approval_requests WHERE status = $1 ORDER BY created_at DESC",
          [status],
        )
      : await this.database.query<ApprovalRow>(
          "SELECT * FROM approval_requests ORDER BY created_at DESC",
        );
    return result.rows.map(mapRow);
  }

  public async review(
    id: string,
    update: {
      status: "approved" | "denied";
      reviewedBy: string;
      reviewNote?: string;
    },
  ): Promise<ApprovalRequest | undefined> {
    const result = await this.database.query<ApprovalRow>(
      `UPDATE approval_requests
       SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_note = $4
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, update.status, update.reviewedBy, update.reviewNote ?? null],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
}
