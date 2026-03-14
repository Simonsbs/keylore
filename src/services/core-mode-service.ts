import {
  coreCredentialCreateInputSchema,
  CoreCredentialCreateInput,
  AuthContext,
  CredentialRecord,
  PolicyRule,
} from "../domain/types.js";
import { PolicyRepository } from "../repositories/interfaces.js";
import { BrokerService } from "./broker-service.js";
import { LocalSecretStore } from "./local-secret-store.js";

export class CoreModeService {
  public constructor(
    private readonly broker: BrokerService,
    private readonly policies: PolicyRepository,
    private readonly localSecrets: LocalSecretStore,
    private readonly defaultPrincipal: string,
  ) {}

  private coreAllowRuleId(tenantId: string, credentialId: string): string {
    const safeTenant = tenantId.replace(/[^a-zA-Z0-9_-]+/g, "-");
    const safeCredential = credentialId.replace(/[^a-zA-Z0-9_-]+/g, "-");
    return `core-allow-${safeTenant}-${safeCredential}`;
  }

  private buildCoreAllowRule(context: AuthContext, credential: CredentialRecord): PolicyRule {
    const principals = Array.from(
      new Set([context.principal, context.clientId, this.defaultPrincipal].filter(Boolean)),
    );

    return {
      id: this.coreAllowRuleId(credential.tenantId, credential.id),
      tenantId: credential.tenantId,
      effect: "allow",
      description: `Core mode auto-allow rule for ${credential.displayName}.`,
      principals,
      principalRoles: ["admin", "operator"],
      credentialIds: [credential.id],
      services: [credential.service],
      operations: credential.permittedOperations,
      domainPatterns: credential.allowedDomains,
      environments: ["development", "test"],
    };
  }

  private async syncCoreAllowRule(context: AuthContext, credential: CredentialRecord): Promise<void> {
    const policies = await this.policies.read();
    const ruleId = this.coreAllowRuleId(credential.tenantId, credential.id);
    const nextRules = policies.rules.filter((rule) => rule.id !== ruleId);
    nextRules.push(this.buildCoreAllowRule(context, credential));
    await this.policies.replaceAll({
      version: policies.version,
      rules: nextRules,
    });
  }

  private async deleteCoreAllowRule(tenantId: string, credentialId: string): Promise<void> {
    const policies = await this.policies.read();
    const ruleId = this.coreAllowRuleId(tenantId, credentialId);
    await this.policies.replaceAll({
      version: policies.version,
      rules: policies.rules.filter((rule) => rule.id !== ruleId),
    });
  }

  public async createCredential(context: AuthContext, input: CoreCredentialCreateInput): Promise<CredentialRecord> {
    const parsed = coreCredentialCreateInputSchema.parse(input);
    const existing = await this.broker.getCredential(context, parsed.credentialId);
    if (existing) {
      throw new Error(`Credential ${parsed.credentialId} already exists.`);
    }

    const binding =
      parsed.secretSource.adapter === "local"
        ? {
            adapter: "local" as const,
            ref: `local:${parsed.tenantId}:${parsed.credentialId}`,
            authType: parsed.authType,
            headerName: parsed.headerName,
            headerPrefix: parsed.headerPrefix,
            injectionEnvName: parsed.injectionEnvName,
          }
        : {
            adapter: "env" as const,
            ref: parsed.secretSource.ref,
            authType: parsed.authType,
            headerName: parsed.headerName,
            headerPrefix: parsed.headerPrefix,
            injectionEnvName: parsed.injectionEnvName,
          };

    const record: CredentialRecord = {
      id: parsed.credentialId,
      tenantId: parsed.tenantId,
      displayName: parsed.displayName,
      service: parsed.service,
      owner: parsed.owner,
      scopeTier: parsed.scopeTier,
      sensitivity: parsed.sensitivity,
      allowedDomains: parsed.allowedDomains,
      permittedOperations: parsed.permittedOperations,
      expiresAt: parsed.expiresAt,
      rotationPolicy: parsed.rotationPolicy,
      lastValidatedAt: null,
      selectionNotes: parsed.selectionNotes,
      binding,
      tags: parsed.tags,
      status: parsed.status,
    };

    if (parsed.secretSource.adapter === "local") {
      await this.localSecrets.put(binding.ref, parsed.secretSource.secretValue);
      try {
        const created = await this.broker.createCredential(context, record);
        try {
          await this.syncCoreAllowRule(context, created);
        } catch (error) {
          await this.broker.deleteCredential(context, created.id);
          await this.localSecrets.delete(binding.ref);
          throw error;
        }
        return created;
      } catch (error) {
        await this.localSecrets.delete(binding.ref);
        throw error;
      }
    }

    const created = await this.broker.createCredential(context, record);
    try {
      await this.syncCoreAllowRule(context, created);
    } catch (error) {
      await this.broker.deleteCredential(context, created.id);
      throw error;
    }
    return created;
  }

  public async updateCredentialContext(
    context: AuthContext,
    credentialId: string,
    patch: Partial<Omit<CredentialRecord, "id" | "binding">>,
  ): Promise<CredentialRecord> {
    const updated = await this.broker.updateCredential(context, credentialId, patch);
    await this.syncCoreAllowRule(context, updated);
    return updated;
  }

  public async deleteCredential(context: AuthContext, credentialId: string): Promise<boolean> {
    const existing = await this.broker.getCredential(context, credentialId);
    if (!existing) {
      return false;
    }

    const deleted = await this.broker.deleteCredential(context, credentialId);
    if (!deleted) {
      return false;
    }

    await this.localSecrets.delete(`local:${existing.tenantId}:${existing.id}`);
    await this.deleteCoreAllowRule(existing.tenantId, existing.id);
    return true;
  }
}
