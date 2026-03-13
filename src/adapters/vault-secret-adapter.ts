import { CredentialRecord } from "../domain/types.js";
import { extractField, parseRef } from "./reference-utils.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

function normalizeTimestamp(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export class VaultSecretAdapter implements SecretAdapter {
  public readonly id = "vault" as const;

  public constructor(
    private readonly addr: string | undefined,
    private readonly token: string | undefined,
    private readonly namespace: string | undefined,
  ) {}

  private headers(): Headers {
    if (!this.addr || !this.token) {
      throw new Error("Vault adapter requires KEYLORE_VAULT_ADDR and KEYLORE_VAULT_TOKEN.");
    }

    const headers = new Headers({
      "x-vault-token": this.token,
    });
    if (this.namespace) {
      headers.set("x-vault-namespace", this.namespace);
    }
    return headers;
  }

  private async read(credential: CredentialRecord) {
    const parsed = parseRef(credential.binding.ref);
    const version = parsed.query.get("version");
    const target = `${this.addr}/v1/${parsed.resource.replace(/^\//, "")}`;
    const url = version ? `${target}?version=${encodeURIComponent(version)}` : target;
    const response = await fetch(url, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw new Error(`Vault request failed with ${response.status} for ${credential.binding.ref}.`);
    }
    return {
      parsed,
      payload: (await response.json()) as {
        data?: {
          data?: Record<string, unknown>;
          metadata?: Record<string, unknown>;
        };
      },
    };
  }

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    const { parsed, payload } = await this.read(credential);
    const secret = extractField(payload.data?.data, parsed.field);

    return {
      secret,
      headerName: credential.binding.headerName,
      headerValue:
        credential.binding.authType === "bearer"
          ? `${credential.binding.headerPrefix ?? "Bearer "}${secret}`
          : secret,
      inspection: await this.inspect(credential),
    };
  }

  public async inspect(credential: CredentialRecord) {
    const { payload } = await this.read(credential);
    const metadata = payload.data?.metadata ?? {};

    return {
      adapter: this.id,
      ref: credential.binding.ref,
      status: "ok" as const,
      resolved: true,
      version:
        typeof metadata.version === "number"
          ? String(metadata.version)
          : typeof metadata.version === "string"
            ? metadata.version
            : undefined,
      createdAt: normalizeTimestamp(metadata.created_time),
      expiresAt: normalizeTimestamp(metadata.deletion_time),
      state: metadata.destroyed === true ? "destroyed" : "active",
      notes: ["Vault inspection reads KV v2 metadata from the bound secret path."],
    };
  }

  public async healthcheck() {
    if (!this.addr || !this.token) {
      return {
        adapter: this.id,
        available: false,
        status: "error" as const,
        details: "Vault adapter is not configured.",
      };
    }

    try {
      const response = await fetch(`${this.addr}/v1/sys/health?standbyok=true&perfstandbyok=true`, {
        headers: this.headers(),
      });
      return {
        adapter: this.id,
        available: response.ok,
        status: response.ok ? ("ok" as const) : ("error" as const),
        details: response.ok ? "Vault health endpoint responded." : `Vault health returned ${response.status}.`,
      };
    } catch (error) {
      return {
        adapter: this.id,
        available: false,
        status: "error" as const,
        details: error instanceof Error ? error.message : "Vault healthcheck failed.",
      };
    }
  }
}
