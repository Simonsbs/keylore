import test from "node:test";
import assert from "node:assert/strict";

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
