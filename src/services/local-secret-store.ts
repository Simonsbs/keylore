import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

interface StoredSecretEntry {
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

interface StoredSecretFile {
  version: 1;
  entries: Record<string, StoredSecretEntry>;
}

function encode(value: Buffer): string {
  return value.toString("base64");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64");
}

const EMPTY_STORE: StoredSecretFile = {
  version: 1,
  entries: {},
};

export class LocalSecretStore {
  public constructor(
    private readonly secretsFilePath: string,
    private readonly keyFilePath: string,
  ) {}

  private async ensureParentDirs(): Promise<void> {
    await fs.mkdir(path.dirname(this.secretsFilePath), { recursive: true });
    await fs.mkdir(path.dirname(this.keyFilePath), { recursive: true });
  }

  private async loadKey(): Promise<Buffer> {
    await this.ensureParentDirs();

    try {
      const existing = await fs.readFile(this.keyFilePath, "utf8");
      return decode(existing.trim());
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
    }

    const key = randomBytes(32);
    await fs.writeFile(this.keyFilePath, encode(key), { mode: 0o600 });
    return key;
  }

  private async loadStore(): Promise<StoredSecretFile> {
    await this.ensureParentDirs();

    try {
      const raw = await fs.readFile(this.secretsFilePath, "utf8");
      const parsed = JSON.parse(raw) as StoredSecretFile;
      if (parsed.version !== 1 || typeof parsed.entries !== "object" || !parsed.entries) {
        throw new Error("Local secret store file is invalid.");
      }
      return parsed;
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
      return { ...EMPTY_STORE, entries: {} };
    }
  }

  private async saveStore(store: StoredSecretFile): Promise<void> {
    await this.ensureParentDirs();
    const tempPath = `${this.secretsFilePath}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(tempPath, this.secretsFilePath);
  }

  private async encrypt(secret: string): Promise<StoredSecretEntry> {
    const key = await this.loadKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      iv: encode(iv),
      tag: encode(tag),
      ciphertext: encode(ciphertext),
      updatedAt: new Date().toISOString(),
    };
  }

  private async decrypt(entry: StoredSecretEntry): Promise<string> {
    const key = await this.loadKey();
    const decipher = createDecipheriv("aes-256-gcm", key, decode(entry.iv));
    decipher.setAuthTag(decode(entry.tag));
    const secret = Buffer.concat([
      decipher.update(decode(entry.ciphertext)),
      decipher.final(),
    ]);
    return secret.toString("utf8");
  }

  public async put(ref: string, secret: string): Promise<void> {
    const store = await this.loadStore();
    store.entries[ref] = await this.encrypt(secret);
    await this.saveStore(store);
  }

  public async get(ref: string): Promise<string | undefined> {
    const store = await this.loadStore();
    const entry = store.entries[ref];
    if (!entry) {
      return undefined;
    }
    return this.decrypt(entry);
  }

  public async delete(ref: string): Promise<void> {
    const store = await this.loadStore();
    if (!store.entries[ref]) {
      return;
    }
    delete store.entries[ref];
    await this.saveStore(store);
  }

  public async inspect(ref: string): Promise<{ resolved: boolean; updatedAt?: string }> {
    const store = await this.loadStore();
    const entry = store.entries[ref];
    return {
      resolved: Boolean(entry),
      updatedAt: entry?.updatedAt,
    };
  }

  public async healthcheck(): Promise<void> {
    await this.loadKey();
    await this.loadStore();
  }
}
