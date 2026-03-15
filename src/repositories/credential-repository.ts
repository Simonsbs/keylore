import { randomUUID } from "node:crypto";

import {
  CatalogSearchInput,
  catalogFileSchema,
  CatalogFile,
  createCredentialInputSchema,
  CredentialRecord,
  updateCredentialInputSchema,
} from "../domain/types.js";
import { readTextFile, writeTextFile } from "./json-file.js";

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function normalizedLlmContext(credential: Pick<CredentialRecord, "selectionNotes" | "llmContext">): string {
  return credential.llmContext?.trim() || credential.selectionNotes;
}

function normalizedUserContext(
  credential: Pick<CredentialRecord, "selectionNotes" | "llmContext" | "userContext">,
): string {
  return credential.userContext?.trim() || normalizedLlmContext(credential);
}

function normalizedUpdateContexts(
  current: CredentialRecord,
  patch: Partial<Omit<CredentialRecord, "id">>,
): { selectionNotes: string; llmContext: string; userContext: string } {
  const llmContext =
    patch.llmContext?.trim() ??
    patch.selectionNotes?.trim() ??
    current.llmContext?.trim() ??
    current.selectionNotes;
  return {
    selectionNotes: llmContext,
    llmContext,
    userContext: patch.userContext?.trim() ?? current.userContext?.trim() ?? llmContext,
  };
}

function matchesQuery(credential: CredentialRecord, query?: string): boolean {
  if (!query) {
    return true;
  }

  const haystack = [
    credential.id,
    credential.displayName,
    credential.service,
    credential.owner,
    credential.userContext ?? "",
    credential.llmContext ?? "",
    credential.selectionNotes,
    ...credential.tags,
  ]
    .join(" ")
    .toLowerCase();

  return normalizeText(query)
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

export class JsonCredentialRepository {
  public constructor(private readonly filePath: string) {}

  public async ensureInitialized(): Promise<void> {
    const file = await readTextFile(this.filePath);
    if (file) {
      catalogFileSchema.parse(JSON.parse(file));
      return;
    }

    const emptyCatalog: CatalogFile = { version: 1, credentials: [] };
    await writeTextFile(this.filePath, `${JSON.stringify(emptyCatalog, null, 2)}\n`);
  }

  public async list(): Promise<CredentialRecord[]> {
    return (await this.readCatalog()).credentials;
  }

  public async getById(id: string): Promise<CredentialRecord | undefined> {
    return (await this.list()).find((credential) => credential.id === id);
  }

  public async search(input: CatalogSearchInput): Promise<CredentialRecord[]> {
    const credentials = await this.list();

    return credentials
      .filter((credential) => matchesQuery(credential, input.query))
      .filter((credential) => (input.service ? credential.service === input.service : true))
      .filter((credential) => (input.owner ? credential.owner === input.owner : true))
      .filter((credential) => (input.scopeTier ? credential.scopeTier === input.scopeTier : true))
      .filter((credential) => (input.sensitivity ? credential.sensitivity === input.sensitivity : true))
      .filter((credential) => (input.status ? credential.status === input.status : true))
      .filter((credential) => (input.tag ? credential.tags.includes(input.tag) : true))
      .slice(0, input.limit);
  }

  public async create(record: CredentialRecord): Promise<CredentialRecord> {
    const parsed = createCredentialInputSchema.parse(record);
    const normalized = {
      ...parsed,
      userContext: normalizedUserContext(parsed),
      llmContext: normalizedLlmContext(parsed),
      selectionNotes: normalizedLlmContext(parsed),
    };
    const catalog = await this.readCatalog();

    if (catalog.credentials.some((credential) => credential.id === normalized.id)) {
      throw new Error(`Credential ${normalized.id} already exists.`);
    }

    catalog.credentials.push(normalized);
    await this.writeCatalog(catalog);
    return normalized;
  }

  public async createWithDefaults(
    record: Omit<CredentialRecord, "id"> & { id?: string },
  ): Promise<CredentialRecord> {
    return this.create({
      id: record.id ?? randomUUID(),
      ...record,
    });
  }

  public async update(
    id: string,
    patch: Partial<Omit<CredentialRecord, "id">>,
  ): Promise<CredentialRecord> {
    const parsedPatch = updateCredentialInputSchema.parse(patch);
    const catalog = await this.readCatalog();
    const index = catalog.credentials.findIndex((credential) => credential.id === id);

    if (index === -1) {
      throw new Error(`Credential ${id} was not found.`);
    }

    const current = catalog.credentials[index]!;
    const merged = createCredentialInputSchema.parse({
      ...current,
      ...parsedPatch,
      id,
    });
    const normalized = {
      ...merged,
      ...normalizedUpdateContexts(current, parsedPatch),
    };

    catalog.credentials[index] = normalized;
    await this.writeCatalog(catalog);
    return normalized;
  }

  public async delete(id: string): Promise<boolean> {
    const catalog = await this.readCatalog();
    const initialLength = catalog.credentials.length;
    catalog.credentials = catalog.credentials.filter((credential) => credential.id !== id);

    if (catalog.credentials.length === initialLength) {
      return false;
    }

    await this.writeCatalog(catalog);
    return true;
  }

  private async readCatalog(): Promise<CatalogFile> {
    const text = await readTextFile(this.filePath);
    if (!text) {
      return { version: 1, credentials: [] };
    }

    return catalogFileSchema.parse(JSON.parse(text));
  }

  private async writeCatalog(catalog: CatalogFile): Promise<void> {
    await writeTextFile(this.filePath, `${JSON.stringify(catalog, null, 2)}\n`);
  }
}
