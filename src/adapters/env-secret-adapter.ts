import { CredentialRecord } from "../domain/types.js";

export interface ResolvedSecret {
  secret: string;
  headerName: string;
  headerValue: string;
}

export class EnvSecretAdapter {
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
    };
  }
}
