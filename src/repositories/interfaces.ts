import {
  ApprovalRequest,
  AuthClientRecord,
  CatalogSearchInput,
  CredentialRecord,
  PolicyFile,
  PrincipalRole,
} from "../domain/types.js";

export interface CredentialRepository {
  ensureInitialized(): Promise<void>;
  list(): Promise<CredentialRecord[]>;
  count(): Promise<number>;
  getById(id: string): Promise<CredentialRecord | undefined>;
  search(input: CatalogSearchInput): Promise<CredentialRecord[]>;
  create(record: CredentialRecord): Promise<CredentialRecord>;
  update(id: string, patch: Partial<Omit<CredentialRecord, "id">>): Promise<CredentialRecord>;
  delete(id: string): Promise<boolean>;
}

export interface PolicyRepository {
  ensureInitialized(): Promise<void>;
  read(): Promise<PolicyFile>;
  replaceAll(file: PolicyFile): Promise<void>;
  count(): Promise<number>;
}

export interface StoredAuthClient extends AuthClientRecord {
  secretHash: string;
  secretSalt: string;
}

export interface AuthClientRepository {
  ensureInitialized(): Promise<void>;
  count(): Promise<number>;
  list(): Promise<AuthClientRecord[]>;
  getByClientId(clientId: string): Promise<StoredAuthClient | undefined>;
  upsert(client: {
    clientId: string;
    displayName: string;
    secretHash: string;
    secretSalt: string;
    roles: PrincipalRole[];
    allowedScopes: string[];
    status: "active" | "disabled";
  }): Promise<void>;
}

export interface ApprovalRepository {
  create(input: ApprovalRequest): Promise<ApprovalRequest>;
  expireStale(): Promise<number>;
  getById(id: string): Promise<ApprovalRequest | undefined>;
  list(status?: ApprovalRequest["status"]): Promise<ApprovalRequest[]>;
  review(
    id: string,
    update: {
      status: "approved" | "denied";
      reviewedBy: string;
      reviewNote?: string;
    },
  ): Promise<ApprovalRequest | undefined>;
}
