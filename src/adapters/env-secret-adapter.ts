import { CredentialRecord } from "../domain/types.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

export class EnvSecretAdapter implements SecretAdapter {
  public readonly id = "env" as const;

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    const { ref, authType, headerName, headerPrefix } = credential.binding;
    const secret = process.env[ref];

    if (!secret) {
      throw new Error(`Missing secret material in environment variable ${ref}.`);
    }

    const headerValue =
      authType === "bearer" ? `${headerPrefix ?? "Bearer "}${secret}` : secret;

    return {
      secret,
      headerName,
      headerValue,
      inspection: {
        adapter: "env",
        ref,
        status: "warning",
        resolved: true,
        notes: ["Environment bindings expose no remote rotation or expiry metadata."],
      },
    };
  }

  public async inspect(credential: CredentialRecord) {
    const secret = process.env[credential.binding.ref];

    return {
      adapter: "env" as const,
      ref: credential.binding.ref,
      status: secret ? "warning" as const : "error" as const,
      resolved: Boolean(secret),
      notes: ["Environment bindings expose no remote rotation or expiry metadata."],
      error: secret ? undefined : `Missing secret material in environment variable ${credential.binding.ref}.`,
    };
  }

  public async healthcheck() {
    return {
      adapter: "env" as const,
      available: true,
      status: "warning" as const,
      details: "Environment adapter is always available but provides no source-side health metadata.",
    };
  }
}
