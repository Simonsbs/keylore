import {
  AdapterHealth,
  CredentialRecord,
  SecretInspection,
} from "../domain/types.js";

export interface ResolvedSecret {
  secret: string;
  headerName: string;
  headerValue: string;
  inspection: SecretInspection;
}

export interface SecretAdapter {
  readonly id: CredentialRecord["binding"]["adapter"];
  resolve(credential: CredentialRecord): Promise<ResolvedSecret>;
  inspect(credential: CredentialRecord): Promise<SecretInspection>;
  healthcheck(): Promise<AdapterHealth>;
}
