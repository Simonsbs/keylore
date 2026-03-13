import { newDb } from "pg-mem";
import { Pool } from "pg";

import { SqlDatabase, TransactionClient } from "./database.js";

class InMemoryDatabase implements SqlDatabase {
  public constructor(private readonly pool: Pool) {}

  public async query(text: string, params?: unknown[]) {
    return this.pool.query(text, params);
  }

  public async withTransaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  public async healthcheck(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createInMemoryDatabase(): SqlDatabase {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
  });
  const adapter = db.adapters.createPg();
  const pool = new adapter.Pool();
  return new InMemoryDatabase(pool);
}
