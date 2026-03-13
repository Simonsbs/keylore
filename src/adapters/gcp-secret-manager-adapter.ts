import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { CredentialRecord } from "../domain/types.js";
import { CommandRunner } from "./command-runner.js";
import { extractField, parseRef } from "./reference-utils.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

export class GcpSecretManagerAdapter implements SecretAdapter {
  public readonly id = "gcp_secret_manager" as const;

  public constructor(
    private readonly commandRunner: CommandRunner,
    private readonly binary: string,
  ) {}

  private parsed(credential: CredentialRecord) {
    const parsed = parseRef(credential.binding.ref);
    return {
      parsed,
      secret: parsed.resource,
      version: parsed.query.get("version") ?? "latest",
      project: parsed.query.get("project") ?? undefined,
      location: parsed.query.get("location") ?? undefined,
    };
  }

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    const { parsed, secret, version, project, location } = this.parsed(credential);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "keylore-gcp-"));
    const outFile = path.join(tempDir, "secret.txt");

    try {
      const args = ["secrets", "versions", "access", version, `--secret=${secret}`, `--out-file=${outFile}`, "--quiet"];
      if (project) {
        args.push(`--project=${project}`);
      }
      if (location) {
        args.push(`--location=${location}`);
      }
      await this.commandRunner.run(this.binary, args, {
        env: process.env,
        timeoutMs: 15_000,
      });

      const raw = await fs.readFile(outFile, "utf8");
      let secretValue: string;
      try {
        secretValue = extractField(JSON.parse(raw), parsed.field);
      } catch {
        secretValue = parsed.field ? extractField({ value: raw }, parsed.field) : raw;
      }

      return {
        secret: secretValue,
        headerName: credential.binding.headerName,
        headerValue:
          credential.binding.authType === "bearer"
            ? `${credential.binding.headerPrefix ?? "Bearer "}${secretValue}`
            : secretValue,
        inspection: await this.inspect(credential),
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  public async inspect(credential: CredentialRecord) {
    const { secret, version, project, location } = this.parsed(credential);
    const secretArgs = ["secrets", "describe", secret, "--format=json", "--quiet"];
    const versionArgs = [
      "secrets",
      "versions",
      "describe",
      version,
      `--secret=${secret}`,
      "--format=json",
      "--quiet",
    ];
    if (project) {
      secretArgs.push(`--project=${project}`);
      versionArgs.push(`--project=${project}`);
    }
    if (location) {
      secretArgs.push(`--location=${location}`);
      versionArgs.push(`--location=${location}`);
    }

    const [secretResult, versionResult] = await Promise.all([
      this.commandRunner.run(this.binary, secretArgs, {
        env: process.env,
        timeoutMs: 15_000,
      }),
      this.commandRunner.run(this.binary, versionArgs, {
        env: process.env,
        timeoutMs: 15_000,
      }),
    ]);
    const secretPayload = JSON.parse(secretResult.stdout) as Record<string, unknown>;
    const versionPayload = JSON.parse(versionResult.stdout) as Record<string, unknown>;
    const rotation = secretPayload.rotation;

    return {
      adapter: this.id,
      ref: credential.binding.ref,
      status: "ok" as const,
      resolved: true,
      createdAt:
        typeof versionPayload.createTime === "string" ? versionPayload.createTime : undefined,
      expiresAt:
        typeof secretPayload.expireTime === "string" ? secretPayload.expireTime : undefined,
      nextRotationAt:
        rotation && typeof rotation === "object" && typeof (rotation as Record<string, unknown>).nextRotationTime === "string"
          ? ((rotation as Record<string, unknown>).nextRotationTime as string)
          : undefined,
      state:
        typeof versionPayload.state === "string" ? versionPayload.state : undefined,
      notes: ["GCP inspection uses gcloud secret and version metadata from the local gcloud context."],
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
        details: error instanceof Error ? error.message : "gcloud CLI unavailable.",
      };
    }
  }
}
