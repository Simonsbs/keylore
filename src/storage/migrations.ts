import fs from "node:fs/promises";
import path from "node:path";

import { SqlDatabase } from "./database.js";

export async function runMigrations(
  database: SqlDatabase,
  migrationsDir: string,
): Promise<void> {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const dirEntries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const migrationFiles = dirEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  for (const fileName of migrationFiles) {
    const version = path.basename(fileName, ".sql");
    const existing = await database.query<{ version: string }>(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [version],
    );

    if ((existing.rowCount ?? 0) > 0) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, fileName), "utf8");
    await database.withTransaction(async (client) => {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
    });
  }
}
