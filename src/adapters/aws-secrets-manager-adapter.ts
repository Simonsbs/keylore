import { CredentialRecord } from "../domain/types.js";
import { CommandRunner } from "./command-runner.js";
import { extractField, parseRef } from "./reference-utils.js";
import { ResolvedSecret, SecretAdapter } from "./types.js";

export class AwsSecretsManagerAdapter implements SecretAdapter {
  public readonly id = "aws_secrets_manager" as const;

  public constructor(
    private readonly commandRunner: CommandRunner,
    private readonly binary: string,
  ) {}

  private args(baseCommand: string, credential: CredentialRecord): string[] {
    const parsed = parseRef(credential.binding.ref);
    const args = ["secretsmanager", baseCommand, "--secret-id", parsed.resource, "--output", "json"];
    const versionId = parsed.query.get("versionId");
    const versionStage = parsed.query.get("versionStage");
    const region = parsed.query.get("region");

    if (versionId) {
      args.push("--version-id", versionId);
    }
    if (versionStage) {
      args.push("--version-stage", versionStage);
    }
    if (region) {
      args.push("--region", region);
    }

    return args;
  }

  public async resolve(credential: CredentialRecord): Promise<ResolvedSecret> {
    const parsed = parseRef(credential.binding.ref);
    const result = await this.commandRunner.run(this.binary, this.args("get-secret-value", credential), {
      env: process.env,
      timeoutMs: 15_000,
    });
    const payload = JSON.parse(result.stdout) as {
      SecretString?: string;
      SecretBinary?: string;
    };

    let secret: string;
    if (typeof payload.SecretString === "string") {
      try {
        secret = extractField(JSON.parse(payload.SecretString), parsed.field);
      } catch {
        secret = parsed.field ? extractField({ value: payload.SecretString }, parsed.field) : payload.SecretString;
      }
    } else if (typeof payload.SecretBinary === "string") {
      secret = Buffer.from(payload.SecretBinary, "base64").toString("utf8");
    } else {
      throw new Error(`AWS Secrets Manager returned no usable secret for ${credential.binding.ref}.`);
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
    const result = await this.commandRunner.run(this.binary, this.args("describe-secret", credential), {
      env: process.env,
      timeoutMs: 15_000,
    });
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;

    return {
      adapter: this.id,
      ref: credential.binding.ref,
      status: "ok" as const,
      resolved: true,
      updatedAt:
        typeof payload.LastChangedDate === "string" ? payload.LastChangedDate : undefined,
      expiresAt:
        typeof payload.DeletedDate === "string" ? payload.DeletedDate : undefined,
      nextRotationAt:
        typeof payload.NextRotationDate === "string" ? payload.NextRotationDate : undefined,
      rotationEnabled:
        typeof payload.RotationEnabled === "boolean" ? payload.RotationEnabled : undefined,
      state:
        typeof payload.DeletedDate === "string" ? "scheduled_for_deletion" : "active",
      notes: ["AWS inspection uses describe-secret metadata from the local aws CLI context."],
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
        details: error instanceof Error ? error.message : "AWS CLI unavailable.",
      };
    }
  }
}
