import fs from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

import { KeyLoreConfig } from "../config.js";

export interface SqlDatabase {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
  exec(text: string): Promise<void>;
  withTransaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T>;
  healthcheck(): Promise<void>;
  close(): Promise<void>;
}

export interface TransactionClient {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>>;
  exec(text: string): Promise<void>;
}

class PostgresDatabase implements SqlDatabase {
  public constructor(private readonly pool: Pool) {}

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, params);
  }

  public async exec(text: string): Promise<void> {
    await this.pool.query(text);
  }

  public async withTransaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const transactionalClient: TransactionClient = {
        query: (text, params) => client.query(text, params),
        exec: async (text) => {
          await client.query(text);
        },
      };
      const result = await fn(transactionalClient);
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

class LocalDatabase implements SqlDatabase {
  private queue: Promise<void> = Promise.resolve();

  public constructor(private readonly database: PGlite) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private normalize<Row extends QueryResultRow = QueryResultRow>(result: {
    rows: unknown[];
    fields?: unknown[];
    affectedRows?: number;
  }): QueryResult<Row> {
    const rows = result.rows as Row[];
    return {
      command: "",
      rowCount: result.affectedRows && result.affectedRows > 0 ? result.affectedRows : rows.length,
      oid: 0,
      rows,
      fields: (result.fields ?? []) as QueryResult<Row>["fields"],
    };
  }

  public async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<Row>> {
    return this.enqueue(async () =>
      this.normalize<Row>(await this.database.query(text, params as unknown[] | undefined)),
    );
  }

  public async exec(text: string): Promise<void> {
    await this.enqueue(async () => {
      await this.database.exec(text);
    });
  }

  public async withTransaction<T>(fn: (client: TransactionClient) => Promise<T>): Promise<T> {
    return this.enqueue(async () => {
      await this.database.exec("BEGIN");
      const client: TransactionClient = {
        query: async (text, params) =>
          this.normalize(await this.database.query(text, params as unknown[] | undefined)),
        exec: async (text) => {
          await this.database.exec(text);
        },
      };

      try {
        const result = await fn(client);
        await this.database.exec("COMMIT");
        return result;
      } catch (error) {
        await this.database.exec("ROLLBACK");
        throw error;
      }
    });
  }

  public async healthcheck(): Promise<void> {
    await this.enqueue(async () => {
      await this.database.query("SELECT 1");
    });
  }

  public async close(): Promise<void> {
    await this.enqueue(async () => {
      await this.database.close();
    });
  }
}

function createPostgresDatabase(config: KeyLoreConfig): SqlDatabase {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
  });

  return new PostgresDatabase(pool);
}

async function createLocalDatabase(config: KeyLoreConfig): Promise<SqlDatabase> {
  await fs.mkdir(path.dirname(config.localDatabasePath), { recursive: true });
  const database = new PGlite(config.localDatabasePath);
  return new LocalDatabase(database);
}

export async function createSqlDatabase(config: KeyLoreConfig): Promise<SqlDatabase> {
  if (config.databaseMode === "postgres") {
    return createPostgresDatabase(config);
  }

  return createLocalDatabase(config);
}
