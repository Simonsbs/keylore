import { CatalogSearchInput, CredentialRecord, PolicyFile } from "../domain/types.js";

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
