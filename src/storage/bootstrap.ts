import { authClientSeedFileSchema, catalogFileSchema, policyFileSchema } from "../domain/types.js";
import { readTextFile } from "../repositories/json-file.js";
import {
  AuthClientRepository,
  CredentialRepository,
  PolicyRepository,
  TenantRepository,
} from "../repositories/interfaces.js";
import { hashSecret } from "../services/auth-secrets.js";

export async function bootstrapFromFiles(
  credentialRepository: CredentialRepository,
  policyRepository: PolicyRepository,
  authClientRepository: AuthClientRepository,
  tenantRepository: TenantRepository,
  catalogPath: string,
  policyPath: string,
  authClientsPath: string,
): Promise<void> {
  const ensureTenant = async (tenantId: string) => {
    const existing = await tenantRepository.getById(tenantId);
    if (!existing) {
      await tenantRepository.create({
        tenantId,
        displayName: tenantId,
        status: "active",
      });
    }
  };

  if ((await credentialRepository.count()) === 0) {
    const catalogText = await readTextFile(catalogPath);
    if (catalogText) {
      const catalog = catalogFileSchema.parse(JSON.parse(catalogText));
      for (const credential of catalog.credentials) {
        await ensureTenant(credential.tenantId);
        await credentialRepository.create(credential);
      }
    }
  }

  if ((await policyRepository.count()) === 0) {
    const policyText = await readTextFile(policyPath);
    if (policyText) {
      const policyFile = policyFileSchema.parse(JSON.parse(policyText));
      for (const rule of policyFile.rules) {
        await ensureTenant(rule.tenantId);
      }
      await policyRepository.replaceAll(policyFile);
    }
  }

  if ((await authClientRepository.count()) === 0) {
    const authClientText = await readTextFile(authClientsPath);
    if (authClientText) {
      const authClients = authClientSeedFileSchema.parse(JSON.parse(authClientText));
      const missingSecrets: string[] = [];
      for (const client of authClients.clients) {
        const secret = client.secretRef ? process.env[client.secretRef] : undefined;
        if (!["private_key_jwt", "none"].includes(client.tokenEndpointAuthMethod) && !secret) {
          missingSecrets.push(`${client.clientId}:${client.secretRef}`);
          continue;
        }

        const hashed = secret ? hashSecret(secret) : undefined;
        await ensureTenant(client.tenantId);
        await authClientRepository.upsert({
          clientId: client.clientId,
          tenantId: client.tenantId,
          displayName: client.displayName,
          secretHash: hashed?.hash,
          secretSalt: hashed?.salt,
          roles: client.roles,
          allowedScopes: client.allowedScopes,
          status: client.status,
          tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
          grantTypes: client.grantTypes,
          redirectUris: client.redirectUris,
          jwks: client.jwks ?? [],
        });
      }

      if (missingSecrets.length > 0) {
        throw new Error(
          `Missing bootstrap auth client secrets for: ${missingSecrets.join(", ")}`,
        );
      }
    }
  }
}
