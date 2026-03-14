import { randomUUID } from "node:crypto";

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
  required_approvals: number;
  approval_count: number;
  denial_count: number;
  reviews: ApprovalRequest["reviews"] | unknown;
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
    requiredApprovals: row.required_approvals,
    approvalCount: row.approval_count,
    denialCount: row.denial_count,
    reviews: Array.isArray(row.reviews) ? row.reviews : [],
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
        correlation_id, fingerprint, required_approvals, approval_count, denial_count, reviews,
        reviewed_by, reviewed_at, review_note
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18,
        $19, $20, $21
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
        parsed.requiredApprovals,
        parsed.approvalCount,
        parsed.denialCount,
        JSON.stringify(parsed.reviews),
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
    return this.database.withTransaction(async (client) => {
      const currentResult = await client.query<ApprovalRow>(
        "SELECT * FROM approval_requests WHERE id = $1 FOR UPDATE",
        [id],
      );
      const current = currentResult.rows[0];
      if (!current) {
        return undefined;
      }

      const parsed = mapRow(current);
      if (parsed.status !== "pending") {
        return undefined;
      }

      if (parsed.reviews.some((review) => review.reviewedBy === update.reviewedBy)) {
        throw new Error("Reviewer has already reviewed this request.");
      }

      const review = {
        reviewId: randomUUID(),
        reviewedAt: new Date().toISOString(),
        reviewedBy: update.reviewedBy,
        decision: update.status,
        note: update.reviewNote,
      } as const;
      const reviews = [...parsed.reviews, review];
      const approvalCount = parsed.approvalCount + (update.status === "approved" ? 1 : 0);
      const denialCount = parsed.denialCount + (update.status === "denied" ? 1 : 0);
      const nextStatus =
        denialCount > 0
          ? "denied"
          : approvalCount >= parsed.requiredApprovals
            ? "approved"
            : "pending";

      const result = await client.query<ApprovalRow>(
        `UPDATE approval_requests
         SET status = $2,
             approval_count = $3,
             denial_count = $4,
             reviews = $5::jsonb,
             reviewed_by = $6,
             reviewed_at = NOW(),
             review_note = $7
         WHERE id = $1
         RETURNING *`,
        [
          id,
          nextStatus,
          approvalCount,
          denialCount,
          JSON.stringify(reviews),
          update.reviewedBy,
          update.reviewNote ?? null,
        ],
      );
      return result.rows[0] ? mapRow(result.rows[0]) : undefined;
    });
  }
}
