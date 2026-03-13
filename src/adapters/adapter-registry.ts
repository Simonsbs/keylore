import {
  AdapterHealth,
  CredentialRecord,
  SecretInspection,
} from "../domain/types.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

export class SecretAdapterRegistry {
  private readonly adapters = new Map<CredentialRecord["binding"]["adapter"], SecretAdapter>();

  public constructor(adapters: SecretAdapter[]) {
    for (const adapter of adapters) {
      this.adapters.set(adapter.id, adapter);
    }
  }

  private adapterFor(credential: CredentialRecord): SecretAdapter {
    const adapter = this.adapters.get(credential.binding.adapter);
    if (!adapter) {
      throw new Error(`Unsupported secret adapter: ${credential.binding.adapter}`);
    }

    return adapter;
  }

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    return this.adapterFor(credential).resolve(credential);
  }

  public async inspectCredential(credential: CredentialRecord): Promise<SecretInspection> {
    try {
      return await this.adapterFor(credential).inspect(credential);
    } catch (error) {
      return {
        adapter: credential.binding.adapter,
        ref: credential.binding.ref,
        status: "error",
        resolved: false,
        notes: [],
        error: error instanceof Error ? error.message : "Inspection failed.",
      };
    }
  }

  public async healthchecks(): Promise<AdapterHealth[]> {
    return Promise.all(Array.from(this.adapters.values(), (adapter) => adapter.healthcheck()));
  }
}
