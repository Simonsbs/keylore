import {
  CatalogSearchInput,
  createCredentialInputSchema,
  CredentialRecord,
  credentialRecordSchema,
  updateCredentialInputSchema,
} from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { CredentialRepository } from "./interfaces.js";

interface CredentialRow {
  id: string;
  tenant_id: string;
  display_name: string;
  service: string;
  owner: string;
  scope_tier: CredentialRecord["scopeTier"];
  sensitivity: CredentialRecord["sensitivity"];
  allowed_domains: string[];
  permitted_operations: CredentialRecord["permittedOperations"];
  expires_at: string | Date | null;
  rotation_policy: string;
  last_validated_at: string | Date | null;
  selection_notes: string;
  binding: CredentialRecord["binding"];
  tags: string[];
  status: CredentialRecord["status"];
}

function mapRow(row: CredentialRow): CredentialRecord {
  return credentialRecordSchema.parse({
    id: row.id,
    tenantId: row.tenant_id,
    displayName: row.display_name,
    service: row.service,
    owner: row.owner,
    scopeTier: row.scope_tier,
    sensitivity: row.sensitivity,
    allowedDomains: row.allowed_domains,
    permittedOperations: row.permitted_operations,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at,
    rotationPolicy: row.rotation_policy,
    lastValidatedAt:
      row.last_validated_at instanceof Date
        ? row.last_validated_at.toISOString()
        : row.last_validated_at,
    selectionNotes: row.selection_notes,
    binding: row.binding,
    tags: row.tags,
    status: row.status,
  });
}

function makeSearchClauses(input: CatalogSearchInput): {
  clause: string;
  params: unknown[];
} {
  const conditions: string[] = [];
  const params: unknown[] = [];

  const push = (sql: string, value: unknown): void => {
    params.push(value);
    conditions.push(sql.replace("$?", `$${params.length}`));
  };

  if (input.query) {
    params.push(input.query);
    const placeholder = `$${params.length}`;
    conditions.push(
      `(id ILIKE '%' || ${placeholder} || '%' OR display_name ILIKE '%' || ${placeholder} || '%' OR service ILIKE '%' || ${placeholder} || '%' OR owner ILIKE '%' || ${placeholder} || '%' OR selection_notes ILIKE '%' || ${placeholder} || '%')`,
    );
  }

  if (input.service) {
    push("service = $?", input.service);
  }

  if (input.owner) {
    push("owner = $?", input.owner);
  }

  if (input.scopeTier) {
    push("scope_tier = $?", input.scopeTier);
  }

  if (input.sensitivity) {
    push("sensitivity = $?", input.sensitivity);
  }

  if (input.status) {
    push("status = $?", input.status);
  }

  if (input.tag) {
    push("$? = ANY(tags)", input.tag);
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

export class PgCredentialRepository implements CredentialRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async ensureInitialized(): Promise<void> {
    await this.database.healthcheck();
  }

  public async list(): Promise<CredentialRecord[]> {
    const result = await this.database.query<CredentialRow>(
      `SELECT * FROM credentials ORDER BY id ASC`,
    );
    return result.rows.map(mapRow);
  }

  public async count(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM credentials",
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  public async getById(id: string): Promise<CredentialRecord | undefined> {
    const result = await this.database.query<CredentialRow>(
      "SELECT * FROM credentials WHERE id = $1",
      [id],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : undefined;
  }

  public async search(input: CatalogSearchInput): Promise<CredentialRecord[]> {
    const { clause, params } = makeSearchClauses(input);
    const limitPlaceholder = `$${params.length + 1}`;
    const result = await this.database.query<CredentialRow>(
      `SELECT * FROM credentials ${clause} ORDER BY id ASC LIMIT ${limitPlaceholder}`,
      [...params, input.limit],
    );
    return result.rows.map(mapRow);
  }

  public async create(record: CredentialRecord): Promise<CredentialRecord> {
    const parsed = createCredentialInputSchema.parse(record);
    await this.database.query(
      `INSERT INTO credentials (
        id, tenant_id, display_name, service, owner, scope_tier, sensitivity,
        allowed_domains, permitted_operations, expires_at, rotation_policy,
        last_validated_at, selection_notes, binding, tags, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14::jsonb, $15, $16
      )`,
      [
        parsed.id,
        parsed.tenantId,
        parsed.displayName,
        parsed.service,
        parsed.owner,
        parsed.scopeTier,
        parsed.sensitivity,
        parsed.allowedDomains,
        parsed.permittedOperations,
        parsed.expiresAt,
        parsed.rotationPolicy,
        parsed.lastValidatedAt,
        parsed.selectionNotes,
        JSON.stringify(parsed.binding),
        parsed.tags,
        parsed.status,
      ],
    );
    return parsed;
  }

  public async update(
    id: string,
    patch: Partial<Omit<CredentialRecord, "id">>,
  ): Promise<CredentialRecord> {
    const parsedPatch = updateCredentialInputSchema.parse(patch);
    const current = await this.getById(id);
    if (!current) {
      throw new Error(`Credential ${id} was not found.`);
    }

    const merged = createCredentialInputSchema.parse({
      ...current,
      ...parsedPatch,
      id,
    });

    await this.database.query(
      `UPDATE credentials SET
        display_name = $2,
        service = $3,
        owner = $4,
        scope_tier = $5,
        sensitivity = $6,
        allowed_domains = $7,
        permitted_operations = $8,
        expires_at = $9,
        rotation_policy = $10,
        last_validated_at = $11,
        selection_notes = $12,
        binding = $13::jsonb,
        tags = $14,
        status = $15,
        updated_at = NOW()
      WHERE id = $1`,
      [
        merged.id,
        merged.displayName,
        merged.service,
        merged.owner,
        merged.scopeTier,
        merged.sensitivity,
        merged.allowedDomains,
        merged.permittedOperations,
        merged.expiresAt,
        merged.rotationPolicy,
        merged.lastValidatedAt,
        merged.selectionNotes,
        JSON.stringify(merged.binding),
        merged.tags,
        merged.status,
      ],
    );

    return merged;
  }

  public async delete(id: string): Promise<boolean> {
    const result = await this.database.query(
      "DELETE FROM credentials WHERE id = $1",
      [id],
    );
    return (result.rowCount ?? 0) > 0;
  }
}
