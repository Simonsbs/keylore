import { randomUUID } from "node:crypto";

import {
  AccessScope,
  accessTokenRecordSchema,
  AccessTokenRecord,
  PrincipalRole,
} from "../domain/types.js";
import { AccessTokenRecordWithHash, AccessTokenRepository } from "./interfaces.js";
import { SqlDatabase } from "../storage/database.js";

interface AccessTokenRow {
  token_id: string;
  token_hash: string;
  client_id: string;
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

function mapRow(row: AccessTokenRow): AccessTokenRecordWithHash {
  const record = accessTokenRecordSchema.parse({
    tokenId: row.token_id,
    clientId: row.client_id,
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

export class PgAccessTokenRepository implements AccessTokenRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async issue(input: {
    tokenHash: string;
    clientId: string;
    subject: string;
    scopes: AccessScope[];
    roles: PrincipalRole[];
    resource?: string;
    expiresAt: string;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO access_tokens (
        token_id, token_hash, client_id, subject, scopes, roles, resource, expires_at, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 'active'
      )`,
      [
        randomUUID(),
        input.tokenHash,
        input.clientId,
        input.subject,
        input.scopes,
        input.roles,
        input.resource ?? null,
        input.expiresAt,
      ],
    );
  }

  public async getByHash(tokenHash: string): Promise<AccessTokenRecordWithHash | undefined> {
    const result = await this.database.query<AccessTokenRow>(
      "SELECT * FROM access_tokens WHERE token_hash = $1",
      [tokenHash],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async touch(tokenHash: string): Promise<void> {
    await this.database.query(
      "UPDATE access_tokens SET last_used_at = NOW() WHERE token_hash = $1",
      [tokenHash],
    );
  }

  public async list(filter?: {
    clientId?: string;
    status?: "active" | "revoked";
  }): Promise<AccessTokenRecord[]> {
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

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.database.query<AccessTokenRow>(
      `SELECT * FROM access_tokens ${where} ORDER BY created_at DESC`,
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
         UPDATE access_tokens
         SET status = 'revoked'
         WHERE status = 'active' AND expires_at <= NOW()
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM expired`,
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async revokeById(tokenId: string): Promise<AccessTokenRecord | undefined> {
    const result = await this.database.query<AccessTokenRow>(
      `UPDATE access_tokens
       SET status = 'revoked'
       WHERE token_id = $1 AND status = 'active'
       RETURNING *`,
      [tokenId],
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
         UPDATE access_tokens
         SET status = 'revoked'
         WHERE client_id = $1 AND status = 'active'
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM revoked`,
      [clientId],
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }
}
