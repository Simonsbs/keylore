import { randomUUID } from "node:crypto";

import { BreakGlassRequest, breakGlassRequestSchema } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { BreakGlassRepository } from "./interfaces.js";

interface BreakGlassRow {
  id: string;
  created_at: string | Date;
  expires_at: string | Date;
  status: BreakGlassRequest["status"];
  requested_by: string;
  requested_roles: BreakGlassRequest["requestedRoles"];
  credential_id: string;
  operation: BreakGlassRequest["operation"];
  target_url: string;
  target_host: string;
  justification: string;
  requested_duration_seconds: number;
  correlation_id: string;
  fingerprint: string;
  required_approvals: number;
  approval_count: number;
  denial_count: number;
  reviews: BreakGlassRequest["reviews"] | unknown;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  revoked_by: string | null;
  revoked_at: string | Date | null;
  revoke_note: string | null;
}

function toIso(value: string | Date | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: BreakGlassRow): BreakGlassRequest {
  return breakGlassRequestSchema.parse({
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
    justification: row.justification,
    requestedDurationSeconds: row.requested_duration_seconds,
    correlationId: row.correlation_id,
    fingerprint: row.fingerprint,
    requiredApprovals: row.required_approvals,
    approvalCount: row.approval_count,
    denialCount: row.denial_count,
    reviews: Array.isArray(row.reviews) ? row.reviews : [],
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: toIso(row.reviewed_at),
    reviewNote: row.review_note ?? undefined,
    revokedBy: row.revoked_by ?? undefined,
    revokedAt: toIso(row.revoked_at),
    revokeNote: row.revoke_note ?? undefined,
  });
}

export class PgBreakGlassRepository implements BreakGlassRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async create(input: BreakGlassRequest): Promise<BreakGlassRequest> {
    const parsed = breakGlassRequestSchema.parse(input);
    await this.database.query(
      `INSERT INTO break_glass_requests (
         id, created_at, expires_at, status, requested_by, requested_roles,
         credential_id, operation, target_url, target_host, justification, requested_duration_seconds,
         correlation_id, fingerprint, required_approvals, approval_count, denial_count, reviews, reviewed_by, reviewed_at, review_note,
         revoked_by, revoked_at, revoke_note
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19, $20, $21,
         $22, $23, $24
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
        parsed.justification,
        parsed.requestedDurationSeconds,
        parsed.correlationId,
        parsed.fingerprint,
        parsed.requiredApprovals,
        parsed.approvalCount,
        parsed.denialCount,
        JSON.stringify(parsed.reviews),
        parsed.reviewedBy ?? null,
        parsed.reviewedAt ?? null,
        parsed.reviewNote ?? null,
        parsed.revokedBy ?? null,
        parsed.revokedAt ?? null,
        parsed.revokeNote ?? null,
      ],
    );
    return parsed;
  }

  public async expireStale(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `WITH expired AS (
         UPDATE break_glass_requests
         SET status = 'expired'
         WHERE status IN ('pending', 'active') AND expires_at <= NOW()
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM expired`,
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async getById(id: string): Promise<BreakGlassRequest | undefined> {
    const result = await this.database.query<BreakGlassRow>(
      "SELECT * FROM break_glass_requests WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async list(filter?: {
    status?: BreakGlassRequest["status"];
    requestedBy?: string;
  }): Promise<BreakGlassRequest[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filter?.status) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }

    if (filter?.requestedBy) {
      params.push(filter.requestedBy);
      clauses.push(`requested_by = $${params.length}`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.database.query<BreakGlassRow>(
      `SELECT * FROM break_glass_requests ${where} ORDER BY created_at DESC`,
      params,
    );
    return result.rows.map(mapRow);
  }

  public async review(
    id: string,
    update: {
      status: "active" | "denied";
      reviewedBy: string;
      reviewNote?: string;
    },
  ): Promise<BreakGlassRequest | undefined> {
    return this.database.withTransaction(async (client) => {
      const currentResult = await client.query<BreakGlassRow>(
        "SELECT * FROM break_glass_requests WHERE id = $1 FOR UPDATE",
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
        decision: update.status === "active" ? "approved" : "denied",
        note: update.reviewNote,
      } as const;
      const reviews = [...parsed.reviews, review];
      const approvalCount = parsed.approvalCount + (update.status === "active" ? 1 : 0);
      const denialCount = parsed.denialCount + (update.status === "denied" ? 1 : 0);
      const nextStatus =
        denialCount > 0
          ? "denied"
          : approvalCount >= parsed.requiredApprovals
            ? "active"
            : "pending";

      const result = await client.query<BreakGlassRow>(
        `UPDATE break_glass_requests
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

  public async revoke(
    id: string,
    update: {
      revokedBy: string;
      revokeNote?: string;
    },
  ): Promise<BreakGlassRequest | undefined> {
    const result = await this.database.query<BreakGlassRow>(
      `UPDATE break_glass_requests
       SET status = 'revoked', revoked_by = $2, revoked_at = NOW(), revoke_note = $3
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [id, update.revokedBy, update.revokeNote ?? null],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
}
