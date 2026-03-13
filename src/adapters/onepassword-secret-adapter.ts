import { CredentialRecord } from "../domain/types.js";
import { CommandRunner } from "./command-runner.js";
import { parseRef } from "./reference-utils.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

function pickTimestamp(payload: Record<string, unknown>, camel: string, snake: string): string | undefined {
  const value = payload[camel] ?? payload[snake];
  return typeof value === "string" ? value : undefined;
}

function pickVersion(payload: Record<string, unknown>): string | undefined {
  const value = payload.version;
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" ? value : undefined;
}

export class OnePasswordSecretAdapter implements SecretAdapter {
  public readonly id = "1password" as const;

  public constructor(
    private readonly commandRunner: CommandRunner,
    private readonly binary: string,
  ) {}

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    const result = await this.commandRunner.run(this.binary, ["read", credential.binding.ref], {
      env: process.env,
      timeoutMs: 10_000,
    });
    const secret = result.stdout.trimEnd();
    if (!secret) {
      throw new Error(`1Password returned no secret value for ${credential.binding.ref}.`);
    }

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
    const parsed = parseRef(credential.binding.ref);
    const reference = new URL(parsed.resource);
    const vault = reference.hostname;
    const item = reference.pathname.split("/").filter(Boolean)[0];
    const args = ["item", "get", item ?? "", "--vault", vault ?? "", "--format", "json"];
    const result = await this.commandRunner.run(this.binary, args, {
      env: process.env,
      timeoutMs: 10_000,
    });
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;

    return {
      adapter: this.id,
      ref: credential.binding.ref,
      status: "ok" as const,
      resolved: true,
      version: pickVersion(payload),
      createdAt: pickTimestamp(payload, "createdAt", "created_at"),
      updatedAt: pickTimestamp(payload, "updatedAt", "updated_at"),
      notes: ["1Password inspection uses item metadata from the local op CLI session."],
    };
  }

  public async healthcheck() {
    try {
      await this.commandRunner.run(this.binary, ["--version"], {
        env: process.env,
        timeoutMs: 5_000,
      });
      return {
        adapter: this.id,
        available: true,
        status: "ok" as const,
        details: `${this.binary} is available.`,
      };
    } catch (error) {
      return {
        adapter: this.id,
        available: false,
        status: "error" as const,
        details: error instanceof Error ? error.message : "1Password CLI unavailable.",
      };
    }
  }
}
