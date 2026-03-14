import { tenantRecordSchema, TenantRecord } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { TenantRepository } from "./interfaces.js";

interface TenantRow {
  tenant_id: string;
  display_name: string;
  description: string | null;
  status: "active" | "disabled";
  created_at: string | Date;
  updated_at: string | Date;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: TenantRow): TenantRecord {
  return tenantRecordSchema.parse({
    tenantId: row.tenant_id,
    displayName: row.display_name,
    description: row.description ?? undefined,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  });
}

export class PgTenantRepository implements TenantRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async ensureInitialized(): Promise<void> {
    await this.database.healthcheck();
  }

  public async list(): Promise<TenantRecord[]> {
    const result = await this.database.query<TenantRow>(
      "SELECT * FROM tenants ORDER BY tenant_id ASC",
    );
    return result.rows.map(mapRow);
  }

  public async getById(tenantId: string): Promise<TenantRecord | undefined> {
    const result = await this.database.query<TenantRow>(
      "SELECT * FROM tenants WHERE tenant_id = $1",
      [tenantId],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async create(input: {
    tenantId: string;
    displayName: string;
    description?: string;
    status: "active" | "disabled";
  }): Promise<TenantRecord> {
    const result = await this.database.query<TenantRow>(
      `INSERT INTO tenants (tenant_id, display_name, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.tenantId, input.displayName, input.description ?? null, input.status],
    );
    return mapRow(result.rows[0]!);
  }

  public async update(
    tenantId: string,
    patch: {
      displayName?: string;
      description?: string;
      status?: "active" | "disabled";
    },
  ): Promise<TenantRecord | undefined> {
    const existing = await this.getById(tenantId);
    if (!existing) {
      return undefined;
    }

    const result = await this.database.query<TenantRow>(
      `UPDATE tenants
       SET display_name = $2,
           description = $3,
           status = $4,
           updated_at = NOW()
       WHERE tenant_id = $1
       RETURNING *`,
      [
        tenantId,
        patch.displayName ?? existing.displayName,
        patch.description ?? existing.description ?? null,
        patch.status ?? existing.status,
      ],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }
}
