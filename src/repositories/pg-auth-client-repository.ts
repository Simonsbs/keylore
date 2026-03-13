import {
  AuthClientRecord,
  authClientRecordSchema,
  PrincipalRole,
} from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { AuthClientRepository, StoredAuthClient } from "./interfaces.js";

interface AuthClientRow {
  client_id: string;
  display_name: string;
  secret_hash: string;
  secret_salt: string;
  roles: PrincipalRole[];
  allowed_scopes: string[];
  status: "active" | "disabled";
}

function mapRow(row: AuthClientRow): StoredAuthClient {
  const base = authClientRecordSchema.parse({
    clientId: row.client_id,
    displayName: row.display_name,
    roles: row.roles,
    allowedScopes: row.allowed_scopes,
    status: row.status,
  });

  return {
    ...base,
    secretHash: row.secret_hash,
    secretSalt: row.secret_salt,
  };
}

function stripSecrets(client: StoredAuthClient): AuthClientRecord {
  return authClientRecordSchema.parse({
    clientId: client.clientId,
    displayName: client.displayName,
    roles: client.roles,
    allowedScopes: client.allowedScopes,
    status: client.status,
  });
}

export class PgAuthClientRepository implements AuthClientRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async ensureInitialized(): Promise<void> {
    await this.database.healthcheck();
  }

  public async count(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM oauth_clients",
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async list(): Promise<AuthClientRecord[]> {
    const result = await this.database.query<AuthClientRow>(
      "SELECT * FROM oauth_clients ORDER BY client_id ASC",
    );
    return result.rows.map((row) => stripSecrets(mapRow(row)));
  }

  public async getByClientId(clientId: string): Promise<StoredAuthClient | undefined> {
    const result = await this.database.query<AuthClientRow>(
      "SELECT * FROM oauth_clients WHERE client_id = $1",
      [clientId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async upsert(client: {
    clientId: string;
    displayName: string;
    secretHash: string;
    secretSalt: string;
    roles: PrincipalRole[];
    allowedScopes: string[];
    status: "active" | "disabled";
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO oauth_clients (
        client_id, display_name, secret_hash, secret_salt, roles, allowed_scopes, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7
      )
      ON CONFLICT (client_id) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        secret_hash = EXCLUDED.secret_hash,
        secret_salt = EXCLUDED.secret_salt,
        roles = EXCLUDED.roles,
        allowed_scopes = EXCLUDED.allowed_scopes,
        status = EXCLUDED.status,
        updated_at = NOW()`,
      [
        client.clientId,
        client.displayName,
        client.secretHash,
        client.secretSalt,
        client.roles,
        client.allowedScopes,
        client.status,
      ],
    );
  }
}
