import { PrincipalRole } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import {
  AuthorizationCodeRecord,
  AuthorizationCodeRepository,
} from "./interfaces.js";

interface AuthorizationCodeRow {
  code_id: string;
  code_hash: string;
  client_id: string;
  tenant_id: string;
  subject: string;
  scopes: string[];
  roles: PrincipalRole[];
  resource: string | null;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: "S256";
  expires_at: string | Date;
  status: "active" | "consumed" | "revoked";
  created_at: string | Date;
  consumed_at: string | Date | null;
}

function toIso(value: string | Date | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: AuthorizationCodeRow): AuthorizationCodeRecord {
  return {
    codeId: row.code_id,
    clientId: row.client_id,
    tenantId: row.tenant_id,
    subject: row.subject,
    scopes: row.scopes,
    roles: row.roles,
    resource: row.resource ?? undefined,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    codeChallengeMethod: row.code_challenge_method,
    expiresAt: toIso(row.expires_at) ?? new Date(0).toISOString(),
    status: row.status,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
    consumedAt: toIso(row.consumed_at),
  };
}

export class PgAuthorizationCodeRepository implements AuthorizationCodeRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async create(input: {
    codeId: string;
    codeHash: string;
    clientId: string;
    tenantId: string;
    subject: string;
    scopes: string[];
    roles: PrincipalRole[];
    resource?: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    expiresAt: string;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO oauth_authorization_codes (
         code_id, code_hash, client_id, tenant_id, subject, scopes, roles, resource,
         redirect_uri, code_challenge, code_challenge_method, expires_at, status
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active'
       )`,
      [
        input.codeId,
        input.codeHash,
        input.clientId,
        input.tenantId,
        input.subject,
        input.scopes,
        input.roles,
        input.resource ?? null,
        input.redirectUri,
        input.codeChallenge,
        input.codeChallengeMethod,
        input.expiresAt,
      ],
    );
  }

  public async consumeByHash(codeHash: string): Promise<AuthorizationCodeRecord | undefined> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<AuthorizationCodeRow>(
        "SELECT * FROM oauth_authorization_codes WHERE code_hash = $1 FOR UPDATE",
        [codeHash],
      );
      const row = result.rows[0];
      if (!row) {
        return undefined;
      }

      const record = mapRow(row);
      const expired = new Date(record.expiresAt).getTime() <= Date.now();
      if (record.status !== "active" || expired) {
        if (expired && record.status === "active") {
          await client.query(
            "UPDATE oauth_authorization_codes SET status = 'revoked' WHERE code_hash = $1",
            [codeHash],
          );
        }
        return undefined;
      }

      await client.query(
        `UPDATE oauth_authorization_codes
         SET status = 'consumed', consumed_at = NOW()
         WHERE code_hash = $1`,
        [codeHash],
      );
      return {
        ...record,
        status: "consumed",
        consumedAt: new Date().toISOString(),
      };
    });
  }

  public async cleanup(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `WITH cleaned AS (
         DELETE FROM oauth_authorization_codes
         WHERE expires_at <= NOW() OR status <> 'active'
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM cleaned`,
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async revokeByClientId(clientId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `WITH revoked AS (
         UPDATE oauth_authorization_codes
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
