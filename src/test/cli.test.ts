import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFile = promisify(execFileCallback);

async function makeCliEnv() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "keylore-cli-"));
  const dataDir = path.join(tempDir, "data");
  await fs.mkdir(dataDir, { recursive: true });

  const catalog = {
    version: 1,
    credentials: [
      {
        id: "demo",
        displayName: "Demo",
        service: "github",
        owner: "platform",
        scopeTier: "read_only",
        sensitivity: "high",
        allowedDomains: ["api.github.com"],
        permittedOperations: ["http.get"],
        expiresAt: null,
        rotationPolicy: "90 days",
        lastValidatedAt: null,
        selectionNotes: "Demo credential",
        binding: {
          adapter: "env",
          ref: "KEYLORE_TEST_SECRET",
          authType: "bearer",
          headerName: "Authorization",
          headerPrefix: "Bearer ",
        },
        tags: ["demo"],
        status: "active",
      },
    ],
  };

  const policies = {
    version: 1,
    rules: [],
  };

  await fs.writeFile(path.join(dataDir, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`);
  await fs.writeFile(path.join(dataDir, "policies.json"), `${JSON.stringify(policies, null, 2)}\n`);

  return {
    tempDir,
    env: {
      ...process.env,
      KEYLORE_DATA_DIR: dataDir,
      KEYLORE_ENVIRONMENT: "test",
      KEYLORE_DEFAULT_PRINCIPAL: "cli-tester",
    },
  };
}

async function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<unknown> {
  const { stdout } = await execFile(
    process.execPath,
    ["--import", "tsx", "src/cli.ts", ...args],
    {
      cwd: "/home/simon/keylore",
      env,
    },
  );

  return JSON.parse(stdout);
}

test("cli catalog list returns metadata-only credentials", async () => {
  const { tempDir, env } = await makeCliEnv();
  const result = (await runCli(["catalog", "list"], env)) as { credentials: Array<Record<string, unknown>> };
  const first = result.credentials.at(0);

  assert.equal(result.credentials.length, 1);
  assert.ok(first);
  assert.equal("binding" in first, false);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("cli catalog create adds a credential from file", async () => {
  const { tempDir, env } = await makeCliEnv();
  const payloadPath = path.join(tempDir, "new-credential.json");
  await fs.writeFile(
    payloadPath,
    `${JSON.stringify(
      {
        id: "npm-demo",
        displayName: "npm Demo",
        service: "npm",
        owner: "platform",
        scopeTier: "read_only",
        sensitivity: "moderate",
        allowedDomains: ["registry.npmjs.org"],
        permittedOperations: ["http.get"],
        expiresAt: null,
        rotationPolicy: "90 days",
        lastValidatedAt: null,
        selectionNotes: "npm metadata credential",
        binding: {
          adapter: "env",
          ref: "KEYLORE_SECRET_NPM",
          authType: "bearer",
          headerName: "Authorization",
          headerPrefix: "Bearer ",
        },
        tags: ["npm"],
        status: "active",
      },
      null,
      2,
    )}\n`,
  );

  const result = (await runCli(["catalog", "create", "--file", payloadPath], env)) as {
    credential: { id: string };
  };

  assert.equal(result.credential.id, "npm-demo");

  const listed = (await runCli(["catalog", "list"], env)) as {
    credentials: Array<{ id: string }>;
  };
  assert.equal(listed.credentials.some((credential) => credential.id === "npm-demo"), true);

  await fs.rm(tempDir, { recursive: true, force: true });
});
