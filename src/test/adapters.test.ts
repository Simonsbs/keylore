import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import { SecretAdapterRegistry } from "../adapters/adapter-registry.js";
import { AwsSecretsManagerAdapter } from "../adapters/aws-secrets-manager-adapter.js";
import { GcpSecretManagerAdapter } from "../adapters/gcp-secret-manager-adapter.js";
import { OnePasswordSecretAdapter } from "../adapters/onepassword-secret-adapter.js";
import { VaultSecretAdapter } from "../adapters/vault-secret-adapter.js";
import { CommandRunner } from "../adapters/command-runner.js";
import { SecretAdapter } from "../adapters/types.js";
import { TelemetryService } from "../services/telemetry.js";

class FakeCommandRunner implements CommandRunner {
  public constructor(
    private readonly handler: (
      command: string,
      args: string[],
    ) => Promise<{ stdout: string; stderr: string }> | { stdout: string; stderr: string },
  ) {}

  public async run(command: string, args: string[]) {
    return this.handler(command, args);
  }
}

const baseCredential = {
  id: "demo",
  displayName: "Demo",
  service: "svc",
  owner: "platform",
  scopeTier: "read_only" as const,
  sensitivity: "high" as const,
  allowedDomains: ["localhost"],
  permittedOperations: ["http.get" as const],
  expiresAt: null,
  rotationPolicy: "30 days",
  lastValidatedAt: null,
  selectionNotes: "Demo",
  tags: [],
  status: "active" as const,
};

test("1Password adapter resolves a secret reference and inspects item metadata", async () => {
  const adapter = new OnePasswordSecretAdapter(
    new FakeCommandRunner(async (_command, args) => {
      if (args[0] === "read") {
        return { stdout: "op-secret\n", stderr: "" };
      }
      return {
        stdout: JSON.stringify({
          version: 7,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-02-01T00:00:00Z",
        }),
        stderr: "",
      };
    }),
    "op",
  );

  const credential = {
    ...baseCredential,
    binding: {
      adapter: "1password" as const,
      ref: "op://engineering/github/token",
      authType: "bearer" as const,
      headerName: "Authorization",
      headerPrefix: "Bearer ",
    },
  };

  const resolved = await adapter.resolve(credential);
  assert.equal(resolved.secret, "op-secret");
  assert.equal(resolved.inspection.version, "7");
  assert.equal(resolved.inspection.updatedAt, "2026-02-01T00:00:00Z");
});

test("Vault adapter resolves KV data and exposes metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: {
          data: { token: "vault-secret" },
          metadata: {
            version: 3,
            created_time: "2026-01-10T00:00:00Z",
            deletion_time: "",
            destroyed: false,
          },
        },
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const adapter = new VaultSecretAdapter("https://vault.example.com", "token", undefined);
    const credential = {
      ...baseCredential,
      binding: {
        adapter: "vault" as const,
        ref: "kv/data/github#token?version=3",
        authType: "bearer" as const,
        headerName: "Authorization",
        headerPrefix: "Bearer ",
      },
    };

    const resolved = await adapter.resolve(credential);
    assert.equal(resolved.secret, "vault-secret");
    assert.equal(resolved.inspection.version, "3");
    assert.equal(resolved.inspection.state, "active");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AWS Secrets Manager adapter resolves a JSON field and exposes rotation metadata", async () => {
  const adapter = new AwsSecretsManagerAdapter(
    new FakeCommandRunner(async (_command, args) => {
      if (args.includes("get-secret-value")) {
        return {
          stdout: JSON.stringify({
            SecretString: JSON.stringify({ token: "aws-secret" }),
          }),
          stderr: "",
        };
      }

      return {
        stdout: JSON.stringify({
          LastChangedDate: "2026-02-02T00:00:00Z",
          NextRotationDate: "2026-03-02T00:00:00Z",
          RotationEnabled: true,
        }),
        stderr: "",
      };
    }),
    "aws",
  );

  const credential = {
    ...baseCredential,
    binding: {
      adapter: "aws_secrets_manager" as const,
      ref: "prod/github#token?region=us-east-1",
      authType: "bearer" as const,
      headerName: "Authorization",
      headerPrefix: "Bearer ",
    },
  };

  const resolved = await adapter.resolve(credential);
  assert.equal(resolved.secret, "aws-secret");
  assert.equal(resolved.inspection.rotationEnabled, true);
  assert.equal(resolved.inspection.nextRotationAt, "2026-03-02T00:00:00Z");
});

test("GCP Secret Manager adapter reads a version and exposes version metadata", async () => {
  const adapter = new GcpSecretManagerAdapter(
    new FakeCommandRunner(async (_command, args) => {
      const outFile = args.find((arg) => arg.startsWith("--out-file="));
      if (outFile) {
        await fs.writeFile(outFile.slice("--out-file=".length), '{"token":"gcp-secret"}', "utf8");
        return { stdout: "", stderr: "" };
      }

      if (args[1] === "describe") {
        return {
          stdout: JSON.stringify({
            rotation: {
              nextRotationTime: "2026-04-01T00:00:00Z",
            },
          }),
          stderr: "",
        };
      }

      return {
        stdout: JSON.stringify({
          createTime: "2026-02-03T00:00:00Z",
          state: "ENABLED",
        }),
        stderr: "",
      };
    }),
    "gcloud",
  );

  const credential = {
    ...baseCredential,
    binding: {
      adapter: "gcp_secret_manager" as const,
      ref: "github-token#token?project=test-project&version=5",
      authType: "bearer" as const,
      headerName: "Authorization",
      headerPrefix: "Bearer ",
    },
  };

  const resolved = await adapter.resolve(credential);
  assert.equal(resolved.secret, "gcp-secret");
  assert.equal(resolved.inspection.state, "ENABLED");
  assert.equal(resolved.inspection.nextRotationAt, "2026-04-01T00:00:00Z");
});

test("adapter registry retries transient failures and opens the circuit after repeated errors", async () => {
  let attempts = 0;
  const adapter: SecretAdapter = {
    id: "env",
    async resolve(credential) {
      attempts += 1;
      if (attempts < 2) {
        throw new Error("ETIMEDOUT during adapter resolve");
      }
      return {
        secret: "retry-secret",
        headerName: credential.binding.headerName,
        headerValue: `${credential.binding.headerPrefix}retry-secret`,
        inspection: {
          adapter: "env",
          ref: credential.binding.ref,
          status: "warning",
          resolved: true,
          notes: [],
        },
      };
    },
    async inspect(credential) {
      return {
        adapter: "env",
        ref: credential.binding.ref,
        status: "warning",
        resolved: true,
        notes: [],
      };
    },
    async healthcheck() {
      return {
        adapter: "env",
        available: true,
        status: "ok",
        details: "ok",
      };
    },
  };

  const registry = new SecretAdapterRegistry(
    [adapter],
    {
      adapterMaxAttempts: 2,
      adapterRetryDelayMs: 1,
      adapterCircuitBreakerThreshold: 2,
      adapterCircuitBreakerCooldownMs: 1000,
    },
    new TelemetryService(),
  );

  const credential = {
    ...baseCredential,
    binding: {
      adapter: "env" as const,
      ref: "KEYLORE_TEST_SECRET",
      authType: "bearer" as const,
      headerName: "Authorization",
      headerPrefix: "Bearer ",
    },
  };

  const resolved = await registry.resolve(credential);
  assert.equal(resolved.secret, "retry-secret");
  assert.equal(attempts, 2);

  let hardFailures = 0;
  const failingAdapter: SecretAdapter = {
    ...adapter,
    async resolve() {
      hardFailures += 1;
      throw new Error("timeout contacting adapter backend");
    },
  };
  const failingRegistry = new SecretAdapterRegistry(
    [failingAdapter],
    {
      adapterMaxAttempts: 1,
      adapterRetryDelayMs: 1,
      adapterCircuitBreakerThreshold: 1,
      adapterCircuitBreakerCooldownMs: 10_000,
    },
    new TelemetryService(),
  );

  await assert.rejects(() => failingRegistry.resolve(credential), /timeout contacting adapter backend/);
  await assert.rejects(() => failingRegistry.resolve(credential), /Adapter circuit is open/);
  assert.equal(hardFailures, 1);
});
