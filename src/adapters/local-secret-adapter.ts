import { CredentialRecord } from "../domain/types.js";
import { LocalSecretStore } from "../services/local-secret-store.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

export class LocalSecretAdapter implements SecretAdapter {
  public readonly id = "local" as const;

  public constructor(private readonly store: LocalSecretStore) {}

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    const { ref, authType, headerName, headerPrefix } = credential.binding;
    const secret = await this.store.get(ref);

    if (!secret) {
      throw new Error(`Missing secret material in local secret store for ${ref}.`);
    }

    const headerValue =
      authType === "bearer" ? `${headerPrefix ?? "Bearer "}${secret}` : secret;

    return {
      secret,
      headerName,
      headerValue,
      inspection: {
        adapter: "local",
        ref,
        status: "ok",
        resolved: true,
        notes: ["Secret is stored in the local encrypted file store."],
      },
    };
  }

  public async inspect(credential: CredentialRecord) {
    const inspection = await this.store.inspect(credential.binding.ref);

    return {
      adapter: "local" as const,
      ref: credential.binding.ref,
      status: inspection.resolved ? ("ok" as const) : ("error" as const),
      resolved: inspection.resolved,
      notes: inspection.resolved
        ? [
            "Secret is stored in the local encrypted file store.",
            inspection.updatedAt ? `Updated at ${inspection.updatedAt}.` : "Update time unavailable.",
          ]
        : ["Secret is not present in the local encrypted file store."],
      error: inspection.resolved
        ? undefined
        : `Missing secret material in local secret store for ${credential.binding.ref}.`,
    };
  }

  public async healthcheck() {
    await this.store.healthcheck();
    return {
      adapter: "local" as const,
      available: true,
      status: "ok" as const,
      details: "Local encrypted file secret store is available.",
    };
  }
}
