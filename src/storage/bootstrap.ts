import { authClientSeedFileSchema, catalogFileSchema, policyFileSchema } from "../domain/types.js";
import { readTextFile } from "../repositories/json-file.js";
import {
  AuthClientRepository,
  CredentialRepository,
  PolicyRepository,
} from "../repositories/interfaces.js";
import { hashSecret } from "../services/auth-secrets.js";

export async function bootstrapFromFiles(
  credentialRepository: CredentialRepository,
  policyRepository: PolicyRepository,
  authClientRepository: AuthClientRepository,
  catalogPath: string,
  policyPath: string,
  authClientsPath: string,
): Promise<void> {
  if ((await credentialRepository.count()) === 0) {
    const catalogText = await readTextFile(catalogPath);
    if (catalogText) {
      const catalog = catalogFileSchema.parse(JSON.parse(catalogText));
      for (const credential of catalog.credentials) {
        await credentialRepository.create(credential);
      }
    }
  }

  if ((await policyRepository.count()) === 0) {
    const policyText = await readTextFile(policyPath);
    if (policyText) {
      const policyFile = policyFileSchema.parse(JSON.parse(policyText));
      await policyRepository.replaceAll(policyFile);
    }
  }

  if ((await authClientRepository.count()) === 0) {
    const authClientText = await readTextFile(authClientsPath);
    if (authClientText) {
      const authClients = authClientSeedFileSchema.parse(JSON.parse(authClientText));
      const missingSecrets: string[] = [];
      for (const client of authClients.clients) {
        const secret = process.env[client.secretRef];
        if (!secret) {
          missingSecrets.push(`${client.clientId}:${client.secretRef}`);
          continue;
        }

        const hashed = hashSecret(secret);
        await authClientRepository.upsert({
          clientId: client.clientId,
          displayName: client.displayName,
          secretHash: hashed.hash,
          secretSalt: hashed.salt,
          roles: client.roles,
          allowedScopes: client.allowedScopes,
          status: client.status,
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
