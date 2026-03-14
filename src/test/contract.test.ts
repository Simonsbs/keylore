import assert from "node:assert/strict";
import test from "node:test";

import { createKeyLoreMcpServer } from "../mcp/create-server.js";
import { makeTestApp } from "./helpers.js";

const stableMcpToolNames = [
  "catalog_search",
  "catalog_get",
  "catalog_report",
  "access_request",
  "policy_simulate",
  "audit_recent",
  "system_adapters",
  "system_maintenance_status",
  "system_recent_traces",
  "system_trace_exporter_status",
  "system_rotation_list",
  "system_rotation_plan",
  "system_rotation_create",
  "system_rotation_complete",
  "break_glass_request",
  "break_glass_list",
  "break_glass_review",
  "runtime_run_sandboxed",
] as const;

test("mcp tool registry matches the frozen rc1 contract", async () => {
  const { app, close } = await makeTestApp();
  const server = createKeyLoreMcpServer(app) as unknown as {
    _registeredTools: Record<
      string,
      {
        description?: string;
        outputSchema?: unknown;
        enabled?: boolean;
      }
    >;
  };

  const tools = server._registeredTools;
  assert.deepEqual(Object.keys(tools), [...stableMcpToolNames]);

  for (const toolName of stableMcpToolNames) {
    const tool = tools[toolName];
    assert.ok(tool);
    assert.notEqual(tool.enabled, false);
    assert.equal(typeof tool.description, "string");
    assert.ok((tool.description ?? "").length >= 20);
    assert.ok(tool.outputSchema);
  }

  await close();
});

test("oauth metadata preserves the frozen rc1 auth contract", async () => {
  const { auth, close } = await makeTestApp({
    configOverrides: {
      publicBaseUrl: "https://keylore.example",
      oauthIssuerUrl: "https://keylore.example/oauth",
    },
  });

  assert.deepEqual(auth.oauthMetadata().grant_types_supported, [
    "client_credentials",
    "authorization_code",
    "refresh_token",
  ]);
  assert.deepEqual(auth.oauthMetadata().token_endpoint_auth_methods_supported, [
    "client_secret_post",
    "client_secret_basic",
    "private_key_jwt",
    "none",
  ]);
  assert.deepEqual(auth.protectedResourceMetadata("/v1"), {
    resource: "https://keylore.example/v1",
    authorization_servers: ["https://keylore.example/oauth"],
    scopes_supported: auth.oauthMetadata().scopes_supported,
    bearer_methods_supported: ["header"],
    resource_name: "KeyLore REST API",
  });
  assert.deepEqual(auth.protectedResourceMetadata("/mcp"), {
    resource: "https://keylore.example/mcp",
    authorization_servers: ["https://keylore.example/oauth"],
    scopes_supported: auth.oauthMetadata().scopes_supported,
    bearer_methods_supported: ["header"],
    resource_name: "KeyLore MCP",
  });

  await close();
});
