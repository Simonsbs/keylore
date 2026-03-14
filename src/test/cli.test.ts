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

test("cli auth clients create returns a generated secret", async () => {
  const { app, close, tempDir } = await makeTestApp();
  const payloadPath = path.join(tempDir, "client.json");
  await fs.writeFile(
    payloadPath,
    `${JSON.stringify(
      {
        clientId: "cli-generated-client",
        displayName: "CLI Generated Client",
        roles: ["consumer"],
        allowedScopes: ["catalog:read"],
      },
      null,
      2,
    )}\n`,
  );

  const result = JSON.parse(
    await runCli(app, ["auth", "clients", "create", "--file", payloadPath]),
  ) as {
    client: { clientId: string };
    clientSecret: string;
  };

  assert.equal(result.client.clientId, "cli-generated-client");
  assert.ok(result.clientSecret.length >= 16);

  const clients = JSON.parse(await runCli(app, ["auth", "clients", "list"])) as {
    clients: Array<{ clientId: string }>;
  };
  assert.equal(clients.clients.some((client) => client.clientId === "cli-generated-client"), true);

  await close();
});

test("cli backup restore recreates deleted catalogue data", async () => {
  const { app, close, tempDir } = await makeTestApp();
  const backupPath = path.join(tempDir, "backup.json");

  const backupResult = JSON.parse(
    await runCli(app, ["system", "backup", "create", "--file", backupPath]),
  ) as { file: string; credentials: number };
  assert.equal(backupResult.file, backupPath);
  assert.equal(backupResult.credentials, 1);

  const deleted = JSON.parse(
    await runCli(app, ["catalog", "delete", "demo"]),
  ) as { deleted: boolean };
  assert.equal(deleted.deleted, true);

  const restoreResult = JSON.parse(
    await runCli(app, ["system", "backup", "restore", "--file", backupPath, "--yes"]),
  ) as { restored: boolean; credentials: number };
  assert.equal(restoreResult.restored, true);
  assert.equal(restoreResult.credentials, 1);

  const listed = JSON.parse(await runCli(app, ["catalog", "list"])) as {
    credentials: Array<{ id: string }>;
  };
  assert.equal(listed.credentials.some((credential) => credential.id === "demo"), true);

  await close();
});

test("cli tenants bootstrap creates a tenant and seeded public client", async () => {
  const { app, close, tempDir } = await makeTestApp();
  const payloadPath = path.join(tempDir, "tenant-bootstrap.json");
  await fs.writeFile(
    payloadPath,
    `${JSON.stringify(
      {
        tenant: {
          tenantId: "tenant-cli",
          displayName: "Tenant CLI",
        },
        authClients: [
          {
            clientId: "tenant-cli-public",
            displayName: "Tenant CLI Public",
            roles: ["consumer"],
            allowedScopes: ["catalog:read", "mcp:use"],
            status: "active",
            tokenEndpointAuthMethod: "none",
            grantTypes: ["authorization_code", "refresh_token"],
            redirectUris: ["http://127.0.0.1/callback"],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const result = JSON.parse(
    await runCli(app, ["tenants", "bootstrap", "--file", payloadPath]),
  ) as {
    tenant: { tenantId: string; authClientCount: number };
    clients: Array<{ client: { clientId: string; grantTypes: string[] } }>;
  };

  assert.equal(result.tenant.tenantId, "tenant-cli");
  assert.equal(result.tenant.authClientCount, 1);
  assert.deepEqual(result.clients[0]?.client.grantTypes, ["authorization_code", "refresh_token"]);

  const tenants = JSON.parse(await runCli(app, ["tenants", "list"])) as {
    tenants: Array<{ tenantId: string }>;
  };
  assert.equal(tenants.tenants.some((tenant) => tenant.tenantId === "tenant-cli"), true);

  await close();
});
