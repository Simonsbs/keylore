import { PolicyFile, PolicyRule, policyFileSchema } from "../domain/types.js";
import { SqlDatabase } from "../storage/database.js";
import { PolicyRepository } from "./interfaces.js";

interface PolicyRow {
  id: string;
  effect: PolicyRule["effect"];
  description: string;
  principals: string[];
  principal_roles: PolicyRule["principalRoles"] | null;
  credential_ids: string[] | null;
  services: string[] | null;
  operations: string[];
  domain_patterns: string[];
  environments: string[] | null;
}

function mapRow(row: PolicyRow): PolicyRule {
  return {
    id: row.id,
    effect: row.effect,
    description: row.description,
    principals: row.principals,
    principalRoles: row.principal_roles ?? undefined,
    credentialIds: row.credential_ids ?? undefined,
    services: row.services ?? undefined,
    operations: row.operations as Array<PolicyRule["operations"][number]>,
    domainPatterns: row.domain_patterns,
    environments: row.environments ?? undefined,
  };
}

export class PgPolicyRepository implements PolicyRepository {
  public constructor(private readonly database: SqlDatabase) {}

  public async ensureInitialized(): Promise<void> {
    await this.database.healthcheck();
  }

  public async read(): Promise<PolicyFile> {
    const result = await this.database.query<PolicyRow>(
      "SELECT * FROM policy_rules ORDER BY id ASC",
    );
    return policyFileSchema.parse({
      version: 1,
      rules: result.rows.map(mapRow),
    });
  }

  public async replaceAll(file: PolicyFile): Promise<void> {
    const parsed = policyFileSchema.parse(file);
    await this.database.withTransaction(async (client) => {
      await client.query("DELETE FROM policy_rules");
      for (const rule of parsed.rules) {
        await client.query(
          `INSERT INTO policy_rules (
            id, effect, description, principals, principal_roles, credential_ids, services,
            operations, domain_patterns, environments
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
          )`,
          [
            rule.id,
            rule.effect,
            rule.description,
            rule.principals,
            rule.principalRoles ?? null,
            rule.credentialIds ?? null,
            rule.services ?? null,
            rule.operations,
            rule.domainPatterns,
            rule.environments ?? null,
          ],
        );
      }
    });
  }

  public async count(): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM policy_rules",
    );
    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }
}
