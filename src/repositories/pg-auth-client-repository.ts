import {
  AuthGrantType,
  AuthClientRecord,
  AuthClientAuthMethod,
  authClientRecordSchema,
  PrincipalRole,
  publicJwkSchema,
} from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { AuthClientRepository, StoredAuthClient } from "./interfaces.js";

interface AuthClientRow {
  client_id: string;
  tenant_id: string;
  display_name: string;
  secret_hash: string | null;
  secret_salt: string | null;
  roles: PrincipalRole[];
  allowed_scopes: string[];
  status: "active" | "disabled";
  token_endpoint_auth_method: AuthClientAuthMethod;
  grant_types: AuthGrantType[];
  redirect_uris: string[];
  jwks: unknown;
}

function normalizeJwks(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value as Array<Record<string, unknown>>;
  }
  if (value && typeof value === "object" && "kty" in value) {
    return [value as Record<string, unknown>];
  }
  return [];
}

function mapRow(row: AuthClientRow): StoredAuthClient {
  const base = authClientRecordSchema.parse({
    clientId: row.client_id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    roles: row.roles,
    allowedScopes: row.allowed_scopes,
    status: row.status,
    tokenEndpointAuthMethod: row.token_endpoint_auth_method,
    grantTypes: row.grant_types,
    redirectUris: row.redirect_uris,
    jwks: normalizeJwks(row.jwks).map((entry) => publicJwkSchema.parse(entry)),
  });

  return {
    ...base,
    secretHash: row.secret_hash ?? undefined,
    secretSalt: row.secret_salt ?? undefined,
  };
}

function stripSecrets(client: StoredAuthClient): AuthClientRecord {
  return authClientRecordSchema.parse({
    clientId: client.clientId,
    tenantId: client.tenantId,
    displayName: client.displayName,
    roles: client.roles,
    allowedScopes: client.allowedScopes,
    status: client.status,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    grantTypes: client.grantTypes,
    redirectUris: client.redirectUris,
    jwks: client.jwks,
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
    tenantId: string;
    displayName: string;
    secretHash?: string;
    secretSalt?: string;
    roles: PrincipalRole[];
    allowedScopes: string[];
    status: "active" | "disabled";
    tokenEndpointAuthMethod: AuthClientAuthMethod;
    grantTypes: AuthGrantType[];
    redirectUris: string[];
    jwks: Array<Record<string, unknown>>;
  }): Promise<void> {
    await this.database.query(
      `INSERT INTO oauth_clients (
        client_id, tenant_id, display_name, secret_hash, secret_salt, roles, allowed_scopes, status,
        token_endpoint_auth_method, grant_types, redirect_uris, jwks
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
      ON CONFLICT (client_id) DO UPDATE SET
        tenant_id = EXCLUDED.tenant_id,
        display_name = EXCLUDED.display_name,
        secret_hash = EXCLUDED.secret_hash,
        secret_salt = EXCLUDED.secret_salt,
        roles = EXCLUDED.roles,
        allowed_scopes = EXCLUDED.allowed_scopes,
        status = EXCLUDED.status,
        token_endpoint_auth_method = EXCLUDED.token_endpoint_auth_method,
        grant_types = EXCLUDED.grant_types,
        redirect_uris = EXCLUDED.redirect_uris,
        jwks = EXCLUDED.jwks,
        updated_at = NOW()`,
      [
        client.clientId,
        client.tenantId,
        client.displayName,
        client.secretHash ?? null,
        client.secretSalt ?? null,
        client.roles,
        client.allowedScopes,
        client.status,
        client.tokenEndpointAuthMethod,
        client.grantTypes,
        client.redirectUris,
        client.jwks,
      ],
    );
  }
}
