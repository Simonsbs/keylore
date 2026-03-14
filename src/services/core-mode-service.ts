import {
  coreCredentialCreateInputSchema,
  CoreCredentialCreateInput,
  AuthContext,
  CredentialRecord,
} from "../domain/types.js";
import { BrokerService } from "./broker-service.js";
import { LocalSecretStore } from "./local-secret-store.js";

export class CoreModeService {
  public constructor(
    private readonly broker: BrokerService,
    private readonly localSecrets: LocalSecretStore,
  ) {}

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
        return await this.broker.createCredential(context, record);
      } catch (error) {
        await this.localSecrets.delete(binding.ref);
        throw error;
      }
    }

    return this.broker.createCredential(context, record);
  }
}
