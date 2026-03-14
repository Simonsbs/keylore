import {
  AuthClientCreateInput,
  authClientSecretOutputSchema,
  AuthContext,
  tenantSummarySchema,
  TenantCreateInput,
  TenantRecord,
  TenantUpdateInput,
} from "../domain/types.js";
import { TenantRepository } from "../repositories/interfaces.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { SqlDatabase } from "../storage/database.js";
import { AuthService } from "./auth-service.js";

function requireTenantAdmin(actor: AuthContext, tenantId?: string): void {
  if (actor.tenantId && tenantId && actor.tenantId !== tenantId) {
    throw new Error("Tenant access denied.");
  }
}

export class TenantService {
  public constructor(
    private readonly tenants: TenantRepository,
    private readonly database: SqlDatabase,
    private readonly audit: PgAuditLogService,
    private readonly auth: AuthService,
  ) {}

  public async list(actor: AuthContext): Promise<Array<ReturnType<typeof tenantSummarySchema.parse>>> {
    const tenants = await this.tenants.list();
    const visibleTenants = actor.tenantId
      ? tenants.filter((tenant) => tenant.tenantId === actor.tenantId)
      : tenants;
    const summaries = await Promise.all(visibleTenants.map((tenant) => this.summaryFor(tenant)));
    return summaries.map((summary) => tenantSummarySchema.parse(summary));
  }

  public async get(
    actor: AuthContext,
    tenantId: string,
  ): Promise<ReturnType<typeof tenantSummarySchema.parse> | undefined> {
    requireTenantAdmin(actor, tenantId);
    const tenant = await this.tenants.getById(tenantId);
    if (!tenant) {
      return undefined;
    }
    return tenantSummarySchema.parse(await this.summaryFor(tenant));
  }

  public async requireActiveTenant(tenantId: string): Promise<TenantRecord> {
    const tenant = await this.tenants.getById(tenantId);
    if (!tenant) {
      throw new Error(`Unknown tenant: ${tenantId}`);
    }
    if (tenant.status !== "active") {
      throw new Error(`Tenant is disabled: ${tenantId}`);
    }
    return tenant;
  }

  public async create(actor: AuthContext, input: TenantCreateInput): Promise<ReturnType<typeof tenantSummarySchema.parse>> {
    requireTenantAdmin(actor, input.tenantId);
    const existing = await this.tenants.getById(input.tenantId);
    if (existing) {
      throw new Error(`Tenant already exists: ${input.tenantId}`);
    }
    const tenant = await this.tenants.create(input);
    await this.audit.record({
      type: "auth.client",
      action: "tenant.create",
      outcome: "success",
      tenantId: tenant.tenantId,
      principal: actor.principal,
      metadata: {
        tenantId: tenant.tenantId,
        status: tenant.status,
      },
    });
    return tenantSummarySchema.parse(await this.summaryFor(tenant));
  }

  public async update(
    actor: AuthContext,
    tenantId: string,
    patch: TenantUpdateInput,
  ): Promise<ReturnType<typeof tenantSummarySchema.parse> | undefined> {
    requireTenantAdmin(actor, tenantId);
    const tenant = await this.tenants.update(tenantId, patch);
    if (!tenant) {
      return undefined;
    }
    await this.audit.record({
      type: "auth.client",
      action: "tenant.update",
      outcome: "success",
      tenantId: tenant.tenantId,
      principal: actor.principal,
      metadata: {
        tenantId: tenant.tenantId,
        fields: Object.keys(patch),
        status: tenant.status,
      },
    });
    return tenantSummarySchema.parse(await this.summaryFor(tenant));
  }

  public async bootstrap(
    actor: AuthContext,
    input: {
      tenant: TenantCreateInput;
      authClients: Array<Omit<AuthClientCreateInput, "tenantId">>;
    }): Promise<{
      tenant: ReturnType<typeof tenantSummarySchema.parse>;
      clients: Array<ReturnType<typeof authClientSecretOutputSchema.parse>>;
    }> {
    const tenant = await this.create(actor, input.tenant);
    const clients: Array<ReturnType<typeof authClientSecretOutputSchema.parse>> = [];
    for (const client of input.authClients) {
      clients.push(
        authClientSecretOutputSchema.parse(
          await this.auth.createClient(actor, {
            ...client,
            tenantId: tenant.tenantId,
          }),
        ),
      );
    }
    const refreshedTenant = tenantSummarySchema.parse(
      await this.summaryFor({
        tenantId: tenant.tenantId,
        displayName: tenant.displayName,
        description: tenant.description,
        status: tenant.status,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      }),
    );
    await this.audit.record({
      type: "auth.client",
      action: "tenant.bootstrap",
      outcome: "success",
      tenantId: refreshedTenant.tenantId,
      principal: actor.principal,
      metadata: {
        tenantId: refreshedTenant.tenantId,
        authClientCount: clients.length,
      },
    });
    return { tenant: refreshedTenant, clients };
  }

  private async summaryFor(tenant: TenantRecord): Promise<ReturnType<typeof tenantSummarySchema.parse>> {
    const result = await this.database.query<{
      credential_count: string;
      auth_client_count: string;
      active_token_count: string;
    }>(
      `SELECT
         (SELECT COUNT(*)::text FROM credentials WHERE tenant_id = $1) AS credential_count,
         (SELECT COUNT(*)::text FROM oauth_clients WHERE tenant_id = $1) AS auth_client_count,
         (SELECT COUNT(*)::text FROM access_tokens WHERE tenant_id = $1 AND status = 'active') AS active_token_count`,
      [tenant.tenantId],
    );
    const row = result.rows[0];
    return {
      ...tenant,
      credentialCount: Number.parseInt(row?.credential_count ?? "0", 10),
      authClientCount: Number.parseInt(row?.auth_client_count ?? "0", 10),
      activeTokenCount: Number.parseInt(row?.active_token_count ?? "0", 10),
    };
  }
}
