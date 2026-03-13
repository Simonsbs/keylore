import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { runCli } from "../cli/run.js";
import { makeTestApp } from "./helpers.js";

test("cli catalog list returns metadata-only credentials", async () => {
  const { app, close } = await makeTestApp();
  const result = JSON.parse(await runCli(app, ["catalog", "list"])) as {
    credentials: Array<Record<string, unknown>>;
  };
  const first = result.credentials.at(0);

  assert.equal(result.credentials.length, 1);
  assert.ok(first);
  assert.equal("binding" in first, false);

  await close();
});

test("cli catalog create adds a credential from file", async () => {
  const { app, tempDir, close } = await makeTestApp();
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

  const result = JSON.parse(
    await runCli(app, ["catalog", "create", "--file", payloadPath]),
  ) as { credential: { id: string } };
  assert.equal(result.credential.id, "npm-demo");

  const listed = JSON.parse(await runCli(app, ["catalog", "list"])) as {
    credentials: Array<{ id: string }>;
  };
  assert.equal(listed.credentials.some((credential) => credential.id === "npm-demo"), true);

  await close();
});
