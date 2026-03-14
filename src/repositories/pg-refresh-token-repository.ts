import { randomUUID } from "node:crypto";

import {
  AccessScope,
  PrincipalRole,
  RefreshTokenRecord,
  refreshTokenRecordSchema,
} from "../domain/types.js";
import {
  RefreshTokenRecordWithHash,
  RefreshTokenRepository,
} from "./interfaces.js";
import { SqlDatabase } from "../storage/database.js";

interface RefreshTokenRow {
  refresh_token_id: string;
  token_hash: string;
  client_id: string;
  tenant_id: string;
  subject: string;
  scopes: AccessScope[];
  roles: PrincipalRole[];
  resource: string | null;
  created_at: string | Date;
  expires_at: string | Date;
  status: "active" | "revoked";
  last_used_at: string | Date | null;
}

function toIso(value: string | Date | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: RefreshTokenRow): RefreshTokenRecordWithHash {
  const record = refreshTokenRecordSchema.parse({
    refreshTokenId: row.refresh_token_id,
    clientId: row.client_id,
    tenantId: row.tenant_id,
    subject: row.subject,
    scopes: row.scopes,
    roles: row.roles,
    resource: row.resource ?? undefined,
    expiresAt: toIso(row.expires_at),
    status: row.status,
    createdAt: toIso(row.created_at),
    lastUsedAt: toIso(row.last_used_at),
  });

  return {
    ...record,
    tokenHash: row.token_hash,
  };
}

export class PgRefreshTokenRepository implements RefreshTokenRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async issue(input: {
    tokenHash: string;
    clientId: string;
    tenantId: string;
    subject: string;
    scopes: string[];
    roles: PrincipalRole[];
    resource?: string;
    expiresAt: string;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO refresh_tokens (
        refresh_token_id, token_hash, client_id, tenant_id, subject, scopes, roles, resource, expires_at, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active'
      )`,
      [
        randomUUID(),
        input.tokenHash,
        input.clientId,
        input.tenantId,
        input.subject,
        input.scopes,
        input.roles,
        input.resource ?? null,
        input.expiresAt,
      ],
    );
  }

  public async getByHash(tokenHash: string): Promise<RefreshTokenRecordWithHash | undefined> {
    const result = await this.database.query<RefreshTokenRow>(
      "SELECT * FROM refresh_tokens WHERE token_hash = $1",
      [tokenHash],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async getById(refreshTokenId: string): Promise<RefreshTokenRecord | undefined> {
    const result = await this.database.query<RefreshTokenRow>(
      "SELECT * FROM refresh_tokens WHERE refresh_token_id = $1",
      [refreshTokenId],
    );
    if (!result.rows[0]) {
      return undefined;
    }
    const { tokenHash: _tokenHash, ...record } = mapRow(result.rows[0]);
    return record;
  }

  public async touch(tokenHash: string): Promise<void> {
    await this.database.query(
      "UPDATE refresh_tokens SET last_used_at = NOW() WHERE token_hash = $1",
      [tokenHash],
    );
  }

  public async list(filter?: {
    clientId?: string;
    tenantId?: string;
    status?: "active" | "revoked";
  }): Promise<RefreshTokenRecord[]> {
    const clauses: string[] = [];
    const values: string[] = [];

    if (filter?.clientId) {
      values.push(filter.clientId);
      clauses.push(`client_id = $${values.length}`);
    }

    if (filter?.status) {
      values.push(filter.status);
      clauses.push(`status = $${values.length}`);
    }

    if (filter?.tenantId) {
      values.push(filter.tenantId);
      clauses.push(`tenant_id = $${values.length}`);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.database.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens ${where} ORDER BY created_at DESC`,
      values,
    );
    return result.rows.map((row) => {
      const { tokenHash: _tokenHash, ...record } = mapRow(row);
      return record;
    });
  }

  public async expireStale(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `WITH expired AS (
         UPDATE refresh_tokens
         SET status = 'revoked'
         WHERE status = 'active' AND expires_at <= NOW()
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM expired`,
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async revokeById(refreshTokenId: string): Promise<RefreshTokenRecord | undefined> {
    const result = await this.database.query<RefreshTokenRow>(
      `UPDATE refresh_tokens
       SET status = 'revoked'
       WHERE refresh_token_id = $1 AND status = 'active'
       RETURNING *`,
      [refreshTokenId],
    );
    if (!result.rows[0]) {
      return undefined;
    }
    const { tokenHash: _tokenHash, ...record } = mapRow(result.rows[0]);
    return record;
  }

  public async revokeByClientId(clientId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `WITH revoked AS (
         UPDATE refresh_tokens
         SET status = 'revoked'
         WHERE client_id = $1 AND status = 'active'
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM revoked`,
      [clientId],
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async replace(
    tokenHash: string,
    replacedByTokenId: string,
  ): Promise<RefreshTokenRecordWithHash | undefined> {
    const result = await this.database.query<RefreshTokenRow>(
      `UPDATE refresh_tokens
       SET status = 'revoked', replaced_by_token_id = $2, last_used_at = NOW()
       WHERE token_hash = $1 AND status = 'active'
       RETURNING *`,
      [tokenHash, replacedByTokenId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
}
