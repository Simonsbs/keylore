import { SqlDatabase } from "../storage/database.js";
import { OAuthClientAssertionRepository } from "./interfaces.js";

export class PgOAuthClientAssertionRepository implements OAuthClientAssertionRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async register(clientId: string, jti: string, expiresAt: string): Promise<boolean> {
    try {
      await this.database.query(
        `INSERT INTO oauth_client_assertion_jtis (client_id, jti, expires_at)
         VALUES ($1, $2, $3)`,
        [clientId, jti, expiresAt],
      );
      return true;
    } catch {
      return false;
    }
  }

  public async cleanup(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM oauth_client_assertion_jtis
         WHERE expires_at <= NOW()
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM deleted`,
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }
}
