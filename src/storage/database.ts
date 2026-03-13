import { Pool, type QueryResult, type QueryResultRow } from "pg";

import { KeyLoreConfig } from "../config.js";

export interface SqlDatabase {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
  withTransaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T>;
  healthcheck(): Promise<void>;
  close(): Promise<void>;
}

export interface TransactionClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
}

class PostgresDatabase implements SqlDatabase {
  public constructor(private readonly pool: Pool) {}

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, params);
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

export function createPostgresDatabase(config: KeyLoreConfig): SqlDatabase {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
  });

  return new PostgresDatabase(pool);
}
