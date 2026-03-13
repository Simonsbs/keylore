import { catalogFileSchema, policyFileSchema } from "../domain/types.js";
import { readTextFile } from "../repositories/json-file.js";
import { CredentialRepository, PolicyRepository } from "../repositories/interfaces.js";

export async function bootstrapFromFiles(
  credentialRepository: CredentialRepository,
  policyRepository: PolicyRepository,
  catalogPath: string,
  policyPath: string,
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
}
