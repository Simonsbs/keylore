import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadConfig } from "../config.js";

test("loadConfig treats blank optional environment values as unset", () => {
  const originalEnv = process.env;

  process.env = {
    ...originalEnv,
    KEYLORE_DATABASE_URL: "postgresql://keylore:keylore@127.0.0.1:5432/keylore",
    KEYLORE_VAULT_ADDR: "",
    KEYLORE_VAULT_TOKEN: "",
    KEYLORE_VAULT_NAMESPACE: "",
    KEYLORE_NOTIFICATION_WEBHOOK_URL: "",
    KEYLORE_NOTIFICATION_SIGNING_SECRET: "",
    KEYLORE_TRACE_EXPORT_URL: "",
    KEYLORE_TRACE_EXPORT_AUTH_HEADER: "",
  };

  try {
    const config = loadConfig("/tmp/keylore-config-test");

    assert.equal(config.vaultAddr, undefined);
    assert.equal(config.vaultToken, undefined);
    assert.equal(config.vaultNamespace, undefined);
    assert.equal(config.notificationWebhookUrl, undefined);
    assert.equal(config.notificationSigningSecret, undefined);
    assert.equal(config.traceExportUrl, undefined);
    assert.equal(config.traceExportAuthHeader, undefined);
  } finally {
    process.env = originalEnv;
  }
});

test("loadConfig auto-loads a local .env file", async () => {
  const originalEnv = process.env;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "keylore-config-"));

  await fs.writeFile(
    path.join(tempDir, ".env"),
    [
      "KEYLORE_DATABASE_URL=postgresql://from-file/keylore",
      "KEYLORE_HTTP_PORT=9911",
      "KEYLORE_LOG_LEVEL=debug",
    ].join("\n"),
  );

  process.env = {};

  try {
    const config = loadConfig(tempDir);

    assert.equal(config.databaseUrl, "postgresql://from-file/keylore");
    assert.equal(config.httpPort, 9911);
    assert.equal(config.logLevel, "debug");
  } finally {
    process.env = originalEnv;
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("loadConfig enables loopback local quickstart defaults when bootstrap secrets are missing", () => {
  const originalEnv = process.env;

  process.env = {
    KEYLORE_HTTP_HOST: "127.0.0.1",
    KEYLORE_ENVIRONMENT: "development",
  };

  try {
    const config = loadConfig("/tmp/keylore-config-test-local");

    assert.equal(config.databaseUrl, "postgresql://keylore:keylore@127.0.0.1:5432/keylore");
    assert.equal(config.localQuickstartEnabled, true);
    assert.deepEqual(config.localAdminBootstrap, {
      clientId: "keylore-admin-local",
      clientSecret: "keylore-local-admin",
      scopes: [
        "catalog:read",
        "catalog:write",
        "admin:read",
        "admin:write",
        "auth:read",
        "auth:write",
        "broker:use",
        "sandbox:run",
        "audit:read",
        "approval:read",
        "approval:review",
        "system:read",
        "system:write",
        "backup:read",
        "backup:write",
        "breakglass:request",
        "breakglass:read",
        "breakglass:review",
        "mcp:use",
      ],
    });
    assert.equal(process.env.KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET, "keylore-local-admin");
    assert.equal(process.env.KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET, "keylore-local-consumer");
  } finally {
    process.env = originalEnv;
  }
});

test("loadConfig does not expose a UI quickstart secret when a custom bootstrap secret is configured", () => {
  const originalEnv = process.env;

  process.env = {
    KEYLORE_HTTP_HOST: "127.0.0.1",
    KEYLORE_ENVIRONMENT: "development",
    KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET: "custom-admin-secret",
  };

  try {
    const config = loadConfig("/tmp/keylore-config-test-custom-secret");

    assert.equal(config.localQuickstartEnabled, true);
    assert.equal(config.localAdminBootstrap, undefined);
  } finally {
    process.env = originalEnv;
  }
});
