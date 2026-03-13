import { randomUUID } from "node:crypto";

import { AccessScope, PrincipalRole } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";

export interface StoredAccessToken {
  tokenId: string;
  tokenHash: string;
  clientId: string;
  subject: string;
  scopes: AccessScope[];
  roles: PrincipalRole[];
  resource: string | undefined;
  expiresAt: string;
  status: "active" | "revoked";
}

interface AccessTokenRow {
  token_id: string;
  token_hash: string;
  client_id: string;
  subject: string;
  scopes: AccessScope[];
  roles: PrincipalRole[];
  resource: string | null;
  expires_at: string | Date;
  status: "active" | "revoked";
}

function mapRow(row: AccessTokenRow): StoredAccessToken {
  return {
    tokenId: row.token_id,
    tokenHash: row.token_hash,
    clientId: row.client_id,
    subject: row.subject,
    scopes: row.scopes,
    roles: row.roles,
    resource: row.resource ?? undefined,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    status: row.status,
  };
}

export class PgAccessTokenRepository {
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

  public async getByHash(tokenHash: string): Promise<StoredAccessToken | undefined> {
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
}
