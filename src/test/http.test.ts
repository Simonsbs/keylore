import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { authContextFromToken, localOperatorContext } from "../services/auth-context.js";
import { startHttpServer } from "../http/server.js";
import { makeTestApp } from "./helpers.js";

async function startLocalTargetServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine test server port.");
  }

  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

test("http server returns 413 for oversized request bodies", async () => {
  const { app, auth, close } = await makeTestApp({
    configOverrides: {
      maxRequestBytes: 128,
      httpPort: 8877,
      publicBaseUrl: "http://127.0.0.1:8877",
      oauthIssuerUrl: "http://127.0.0.1:8877/oauth",
    },
  });
  const server = await startHttpServer(app);
  const token = await auth.issueToken({
    clientId: "admin-client",
    clientSecret: "admin-secret",
    grantType: "client_credentials",
    scope: ["catalog:read"],
  });

  const response = await fetch("http://127.0.0.1:8877/v1/catalog/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({ query: "x".repeat(1000), limit: 10 }),
  });

  assert.equal(response.status, 413);

  await server.close();
  await close();
});

test("proxy responses are redacted and truncated", async () => {
  process.env.KEYLORE_TEST_SECRET = "super-secret-value";
  const target = await startLocalTargetServer((_req, res) => {
    const responseBody = JSON.stringify({
      token: "super-secret-value",
      authorization: "Bearer super-secret-value",
      payload: "x".repeat(5000),
    });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(responseBody);
  });

  const { broker, close } = await makeTestApp({
    configOverrides: {
      maxResponseBytes: 256,
    },
  });

  const result = await broker.requestAccess(
    authContextFromToken({
      principal: "local-operator",
      clientId: "local-cli",
      roles: ["admin", "operator", "auditor", "approver"],
      scopes: [
        "catalog:read",
        "catalog:write",
        "broker:use",
        "audit:read",
        "approval:read",
        "approval:review",
        "mcp:use",
      ],
    }),
    {
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/demo`,
    },
  );

  assert.equal(result.decision, "allowed");
  assert.ok(result.httpResult);
  assert.equal(result.httpResult.bodyPreview.includes("super-secret-value"), false);
  assert.equal(result.httpResult.bodyTruncated, true);
  assert.match(result.httpResult.bodyPreview, /REDACTED/);

  delete process.env.KEYLORE_TEST_SECRET;
  await target.close();
  await close();
});

test("oauth token endpoint and approval workflow operate over HTTP", async () => {
  process.env.KEYLORE_TEST_SECRET = "phase2-secret";
  const target = await startLocalTargetServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  const { app, close } = await makeTestApp({
    policies: {
      version: 1,
      rules: [
        {
          id: "approval-demo",
          effect: "approval",
          description: "Needs approval",
          principals: ["consumer-client"],
          principalRoles: ["consumer"],
          credentialIds: ["demo"],
          operations: ["http.get"],
          domainPatterns: ["localhost"],
          environments: ["test"],
        },
      ],
    },
    configOverrides: {
      httpPort: 8878,
      publicBaseUrl: "http://127.0.0.1:8878",
      oauthIssuerUrl: "http://127.0.0.1:8878/oauth",
    },
  });
  const server = await startHttpServer(app);

  const tokenResponse = await fetch("http://127.0.0.1:8878/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "consumer-client",
      client_secret: "consumer-secret",
      scope: "catalog:read broker:use mcp:use",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const consumerToken = (await tokenResponse.json()) as { access_token: string };

  const approvalResponse = await fetch("http://127.0.0.1:8878/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${consumerToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/approved`,
    }),
  });
  assert.equal(approvalResponse.status, 200);
  const approvalDecision = (await approvalResponse.json()) as {
    decision: string;
    approvalRequestId?: string;
  };
  assert.equal(approvalDecision.decision, "approval_required");
  assert.ok(approvalDecision.approvalRequestId);

  const adminTokenResponse = await fetch("http://127.0.0.1:8878/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "approval:read approval:review broker:use catalog:read",
    }),
  });
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const reviewResponse = await fetch(
    `http://127.0.0.1:8878/v1/approvals/${approvalDecision.approvalRequestId}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken.access_token}`,
      },
      body: JSON.stringify({ note: "approved in test" }),
    },
  );
  assert.equal(reviewResponse.status, 200);

  const approvedAccess = await fetch("http://127.0.0.1:8878/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${consumerToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/approved`,
      approvalId: approvalDecision.approvalRequestId,
    }),
  });
  const approvedDecision = (await approvedAccess.json()) as { decision: string };
  assert.equal(approvedDecision.decision, "allowed");

  delete process.env.KEYLORE_TEST_SECRET;
  await server.close();
  await target.close();
  await close();
});

test("simulation and dry-run evaluate policy without executing the outbound request", async () => {
  process.env.KEYLORE_TEST_SECRET = "dry-run-secret";
  let requestCount = 0;
  const target = await startLocalTargetServer((_req, res) => {
    requestCount += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  const { app, close } = await makeTestApp({
    policies: {
      version: 1,
      rules: [
        {
          id: "allow-admin-demo",
          effect: "allow",
          description: "Allow admin demo reads",
          principals: ["admin-client"],
          principalRoles: ["admin"],
          credentialIds: ["demo"],
          operations: ["http.get"],
          domainPatterns: ["localhost"],
          environments: ["test"],
        },
      ],
    },
    configOverrides: {
      httpPort: 8881,
      publicBaseUrl: "http://127.0.0.1:8881",
      oauthIssuerUrl: "http://127.0.0.1:8881/oauth",
    },
  });
  const server = await startHttpServer(app);

  const tokenResponse = await fetch("http://127.0.0.1:8881/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "broker:use",
      resource: "http://127.0.0.1:8881/v1",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const token = (await tokenResponse.json()) as { access_token: string };

  const simulateResponse = await fetch("http://127.0.0.1:8881/v1/access/simulate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/simulate`,
    }),
  });
  assert.equal(simulateResponse.status, 200);
  const simulated = (await simulateResponse.json()) as { decision: string; mode: string };
  assert.equal(simulated.decision, "allowed");
  assert.equal(simulated.mode, "simulation");
  assert.equal(requestCount, 0);

  const dryRunResponse = await fetch("http://127.0.0.1:8881/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/dry-run`,
      dryRun: true,
    }),
  });
  assert.equal(dryRunResponse.status, 200);
  const dryRun = (await dryRunResponse.json()) as { decision: string; mode: string };
  assert.equal(dryRun.decision, "allowed");
  assert.equal(dryRun.mode, "dry_run");
  assert.equal(requestCount, 0);

  const liveResponse = await fetch("http://127.0.0.1:8881/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/live`,
    }),
  });
  assert.equal(liveResponse.status, 200);
  const live = (await liveResponse.json()) as { decision: string; mode: string };
  assert.equal(live.decision, "allowed");
  assert.equal(live.mode, "live");
  assert.equal(requestCount, 1);

  delete process.env.KEYLORE_TEST_SECRET;
  await server.close();
  await target.close();
  await close();
});

test("resource metadata is exposed and resource-bound tokens cannot cross protected resources", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8879,
      publicBaseUrl: "http://127.0.0.1:8879",
      oauthIssuerUrl: "http://127.0.0.1:8879/oauth",
    },
  });
  const server = await startHttpServer(app);

  const metadataResponse = await fetch(
    "http://127.0.0.1:8879/.well-known/oauth-protected-resource/api",
  );
  assert.equal(metadataResponse.status, 200);
  const metadata = (await metadataResponse.json()) as { resource: string };
  assert.equal(metadata.resource, "http://127.0.0.1:8879/v1");

  const tokenResponse = await fetch("http://127.0.0.1:8879/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "consumer-client",
      client_secret: "consumer-secret",
      scope: "catalog:read mcp:use",
      resource: "http://127.0.0.1:8879/mcp",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const token = (await tokenResponse.json()) as { access_token: string };

  const apiResponse = await fetch("http://127.0.0.1:8879/v1/catalog/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token.access_token}`,
    },
    body: JSON.stringify({ limit: 1 }),
  });
  assert.equal(apiResponse.status, 401);
  const body = (await apiResponse.json()) as { error: string };
  assert.match(body.error, /resource/i);

  await server.close();
  await close();
});

test("auth client lifecycle and token revocation APIs operate over HTTP", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8882,
      publicBaseUrl: "http://127.0.0.1:8882",
      oauthIssuerUrl: "http://127.0.0.1:8882/oauth",
    },
  });
  const server = await startHttpServer(app);

  const adminTokenResponse = await fetch("http://127.0.0.1:8882/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "auth:read auth:write catalog:read",
      resource: "http://127.0.0.1:8882/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const createClientResponse = await fetch("http://127.0.0.1:8882/v1/auth/clients", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken.access_token}`,
    },
    body: JSON.stringify({
      clientId: "ephemeral-client",
      displayName: "Ephemeral Client",
      roles: ["consumer"],
      allowedScopes: ["catalog:read"],
    }),
  });
  assert.equal(createClientResponse.status, 201);
  const createdClient = (await createClientResponse.json()) as {
    client: { clientId: string; status: string };
    clientSecret: string;
  };
  assert.equal(createdClient.client.clientId, "ephemeral-client");
  assert.equal(createdClient.client.status, "active");
  assert.ok(createdClient.clientSecret.length >= 16);

  const tokenResponse = await fetch("http://127.0.0.1:8882/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "ephemeral-client",
      client_secret: createdClient.clientSecret,
      scope: "catalog:read",
      resource: "http://127.0.0.1:8882/v1",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const clientToken = (await tokenResponse.json()) as { access_token: string };

  const searchResponse = await fetch("http://127.0.0.1:8882/v1/catalog/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${clientToken.access_token}`,
    },
    body: JSON.stringify({ limit: 1 }),
  });
  assert.equal(searchResponse.status, 200);

  const tokenListResponse = await fetch(
    "http://127.0.0.1:8882/v1/auth/tokens?clientId=ephemeral-client",
    {
      headers: {
        authorization: `Bearer ${adminToken.access_token}`,
      },
    },
  );
  assert.equal(tokenListResponse.status, 200);
  const tokenList = (await tokenListResponse.json()) as {
    tokens: Array<{ tokenId: string; status: string }>;
  };
  assert.equal(tokenList.tokens.length, 1);
  assert.equal(tokenList.tokens[0]?.status, "active");

  const revokeResponse = await fetch(
    `http://127.0.0.1:8882/v1/auth/tokens/${tokenList.tokens[0]?.tokenId}/revoke`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken.access_token}`,
      },
    },
  );
  assert.equal(revokeResponse.status, 200);

  const revokedSearchResponse = await fetch("http://127.0.0.1:8882/v1/catalog/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${clientToken.access_token}`,
    },
    body: JSON.stringify({ limit: 1 }),
  });
  assert.equal(revokedSearchResponse.status, 401);

  const rotateResponse = await fetch(
    "http://127.0.0.1:8882/v1/auth/clients/ephemeral-client/rotate-secret",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken.access_token}`,
      },
      body: JSON.stringify({}),
    },
  );
  assert.equal(rotateResponse.status, 200);
  const rotated = (await rotateResponse.json()) as { clientSecret: string };
  assert.ok(rotated.clientSecret.length >= 16);
  assert.notEqual(rotated.clientSecret, createdClient.clientSecret);

  const oldSecretTokenResponse = await fetch("http://127.0.0.1:8882/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "ephemeral-client",
      client_secret: createdClient.clientSecret,
      scope: "catalog:read",
      resource: "http://127.0.0.1:8882/v1",
    }),
  });
  assert.equal(oldSecretTokenResponse.status, 401);

  const newSecretTokenResponse = await fetch("http://127.0.0.1:8882/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "ephemeral-client",
      client_secret: rotated.clientSecret,
      scope: "catalog:read",
      resource: "http://127.0.0.1:8882/v1",
    }),
  });
  assert.equal(newSecretTokenResponse.status, 200);

  const disableResponse = await fetch(
    "http://127.0.0.1:8882/v1/auth/clients/ephemeral-client/disable",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken.access_token}`,
      },
    },
  );
  assert.equal(disableResponse.status, 200);

  const disabledTokenResponse = await fetch("http://127.0.0.1:8882/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "ephemeral-client",
      client_secret: rotated.clientSecret,
      scope: "catalog:read",
      resource: "http://127.0.0.1:8882/v1",
    }),
  });
  assert.equal(disabledTokenResponse.status, 401);

  const enableResponse = await fetch(
    "http://127.0.0.1:8882/v1/auth/clients/ephemeral-client/enable",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken.access_token}`,
      },
    },
  );
  assert.equal(enableResponse.status, 200);

  const enabledTokenResponse = await fetch("http://127.0.0.1:8882/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "ephemeral-client",
      client_secret: rotated.clientSecret,
      scope: "catalog:read",
      resource: "http://127.0.0.1:8882/v1",
    }),
  });
  assert.equal(enabledTokenResponse.status, 200);

  await server.close();
  await close();
});

test("catalog reports and adapter health expose rotation metadata without secrets", async () => {
  process.env.KEYLORE_TEST_SECRET = "report-secret";
  const { app, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "demo",
          displayName: "Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "high",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: "2030-01-01T00:00:00.000Z",
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Demo credential",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
            injectionEnvName: "DEMO_TOKEN",
          },
          tags: ["demo"],
          status: "active",
        },
      ],
    },
    configOverrides: {
      httpPort: 8883,
      publicBaseUrl: "http://127.0.0.1:8883",
      oauthIssuerUrl: "http://127.0.0.1:8883/oauth",
    },
  });
  const server = await startHttpServer(app);

  const adminTokenResponse = await fetch("http://127.0.0.1:8883/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "catalog:read system:read",
      resource: "http://127.0.0.1:8883/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const reportResponse = await fetch("http://127.0.0.1:8883/v1/catalog/credentials/demo/report", {
    headers: {
      authorization: `Bearer ${adminToken.access_token}`,
    },
  });
  assert.equal(reportResponse.status, 200);
  const reportBody = (await reportResponse.json()) as {
    reports: Array<{
      runtimeMode: string;
      inspection: { adapter: string; status: string; resolved: boolean; error?: string };
    }>;
  };
  assert.equal(reportBody.reports.length, 1);
  assert.equal(reportBody.reports[0]?.runtimeMode, "sandbox_injection");
  assert.equal(reportBody.reports[0]?.inspection.adapter, "env");
  assert.equal(reportBody.reports[0]?.inspection.resolved, true);

  const adaptersResponse = await fetch("http://127.0.0.1:8883/v1/system/adapters", {
    headers: {
      authorization: `Bearer ${adminToken.access_token}`,
    },
  });
  assert.equal(adaptersResponse.status, 200);
  const adaptersBody = (await adaptersResponse.json()) as {
    adapters: Array<{ adapter: string }>;
  };
  assert.equal(adaptersBody.adapters.some((adapter) => adapter.adapter === "env"), true);

  delete process.env.KEYLORE_TEST_SECRET;
  await server.close();
  await close();
});

test("sandbox runtime injects a secret without exposing it in the result", async () => {
  process.env.KEYLORE_TEST_SECRET = "sandbox-secret";
  const { app, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "sandbox-demo",
          displayName: "Sandbox Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "high",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Sandbox credential",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
            injectionEnvName: "SANDBOX_TOKEN",
          },
          tags: ["sandbox"],
          status: "active",
        },
      ],
    },
    configOverrides: {
      httpPort: 8884,
      publicBaseUrl: "http://127.0.0.1:8884",
      oauthIssuerUrl: "http://127.0.0.1:8884/oauth",
      sandboxInjectionEnabled: true,
      sandboxCommandAllowlist: [process.execPath],
    },
  });
  const server = await startHttpServer(app);

  const adminTokenResponse = await fetch("http://127.0.0.1:8884/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "sandbox:run",
      resource: "http://127.0.0.1:8884/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const runtimeResponse = await fetch("http://127.0.0.1:8884/v1/runtime/sandbox", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "sandbox-demo",
      command: process.execPath,
      args: ["-e", "console.log(process.env.SANDBOX_TOKEN); console.error(`Bearer ${process.env.SANDBOX_TOKEN}`);"],
    }),
  });
  assert.equal(runtimeResponse.status, 200);
  const runtimeBody = (await runtimeResponse.json()) as {
    result: { stdoutPreview: string; stderrPreview: string; exitCode: number };
  };
  assert.equal(runtimeBody.result.exitCode, 0);
  assert.equal(runtimeBody.result.stdoutPreview.includes("sandbox-secret"), false);
  assert.equal(runtimeBody.result.stderrPreview.includes("sandbox-secret"), false);
  assert.match(runtimeBody.result.stdoutPreview, /REDACTED/);
  assert.match(runtimeBody.result.stderrPreview, /REDACTED/);

  delete process.env.KEYLORE_TEST_SECRET;
  await server.close();
  await close();
});

test("auth and maintenance administration are separated by specialized roles and scopes", async () => {
  const { app, close } = await makeTestApp({
    authClients: [
      {
        clientId: "auth-admin-client",
        displayName: "Auth Admin Client",
        roles: ["auth_admin"],
        allowedScopes: ["auth:read", "auth:write"],
        status: "active",
        clientSecret: "auth-admin-secret",
      },
      {
        clientId: "maintenance-client",
        displayName: "Maintenance Client",
        roles: ["maintenance_operator"],
        allowedScopes: ["system:read", "system:write"],
        status: "active",
        clientSecret: "maintenance-secret",
      },
    ],
    configOverrides: {
      httpPort: 8888,
      publicBaseUrl: "http://127.0.0.1:8888",
      oauthIssuerUrl: "http://127.0.0.1:8888/oauth",
    },
  });
  const server = await startHttpServer(app);

  const authAdminTokenResponse = await fetch("http://127.0.0.1:8888/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "auth-admin-client",
      client_secret: "auth-admin-secret",
      scope: "auth:read auth:write",
      resource: "http://127.0.0.1:8888/v1",
    }),
  });
  assert.equal(authAdminTokenResponse.status, 200);
  const authAdminToken = (await authAdminTokenResponse.json()) as { access_token: string };

  const createClientResponse = await fetch("http://127.0.0.1:8888/v1/auth/clients", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authAdminToken.access_token}`,
    },
    body: JSON.stringify({
      clientId: "rbac-created-client",
      displayName: "RBAC Created Client",
      roles: ["consumer"],
      allowedScopes: ["catalog:read"],
    }),
  });
  assert.equal(createClientResponse.status, 201);

  const forbiddenMaintenanceResponse = await fetch("http://127.0.0.1:8888/v1/system/maintenance/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${authAdminToken.access_token}`,
    },
  });
  assert.equal(forbiddenMaintenanceResponse.status, 403);

  const maintenanceTokenResponse = await fetch("http://127.0.0.1:8888/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "maintenance-client",
      client_secret: "maintenance-secret",
      scope: "system:read system:write",
      resource: "http://127.0.0.1:8888/v1",
    }),
  });
  assert.equal(maintenanceTokenResponse.status, 200);
  const maintenanceToken = (await maintenanceTokenResponse.json()) as { access_token: string };

  const maintenanceRunResponse = await fetch("http://127.0.0.1:8888/v1/system/maintenance/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${maintenanceToken.access_token}`,
    },
  });
  assert.equal(maintenanceRunResponse.status, 200);

  const forbiddenAuthResponse = await fetch("http://127.0.0.1:8888/v1/auth/clients", {
    headers: {
      authorization: `Bearer ${maintenanceToken.access_token}`,
    },
  });
  assert.equal(forbiddenAuthResponse.status, 403);

  await server.close();
  await close();
});

test("break-glass workflow enables emergency access after approval", async () => {
  process.env.KEYLORE_TEST_SECRET = "breakglass-secret";
  const target = await startLocalTargetServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  const { app, close } = await makeTestApp({
    authClients: [
      {
        clientId: "breakglass-requester",
        displayName: "Breakglass Requester",
        roles: ["breakglass_operator"],
        allowedScopes: ["broker:use", "breakglass:request", "breakglass:read"],
        status: "active",
        clientSecret: "breakglass-requester-secret",
      },
      {
        clientId: "breakglass-approver",
        displayName: "Breakglass Approver",
        roles: ["approver"],
        allowedScopes: ["breakglass:read", "breakglass:review"],
        status: "active",
        clientSecret: "breakglass-approver-secret",
      },
    ],
    configOverrides: {
      httpPort: 8889,
      publicBaseUrl: "http://127.0.0.1:8889",
      oauthIssuerUrl: "http://127.0.0.1:8889/oauth",
    },
  });
  const server = await startHttpServer(app);

  const requesterTokenResponse = await fetch("http://127.0.0.1:8889/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "breakglass-requester",
      client_secret: "breakglass-requester-secret",
      scope: "broker:use breakglass:request breakglass:read",
      resource: "http://127.0.0.1:8889/v1",
    }),
  });
  assert.equal(requesterTokenResponse.status, 200);
  const requesterToken = (await requesterTokenResponse.json()) as { access_token: string };

  const deniedAccessResponse = await fetch("http://127.0.0.1:8889/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requesterToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/breakglass`,
    }),
  });
  assert.equal(deniedAccessResponse.status, 200);
  const deniedDecision = (await deniedAccessResponse.json()) as { decision: string };
  assert.equal(deniedDecision.decision, "denied");

  const requestResponse = await fetch("http://127.0.0.1:8889/v1/break-glass", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requesterToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/breakglass`,
      justification: "Emergency package registry access to recover a blocked release pipeline.",
      requestedDurationSeconds: 300,
    }),
  });
  assert.equal(requestResponse.status, 201);
  const requestBody = (await requestResponse.json()) as { request: { id: string; status: string } };
  assert.equal(requestBody.request.status, "pending");

  const approverTokenResponse = await fetch("http://127.0.0.1:8889/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "breakglass-approver",
      client_secret: "breakglass-approver-secret",
      scope: "breakglass:read breakglass:review",
      resource: "http://127.0.0.1:8889/v1",
    }),
  });
  assert.equal(approverTokenResponse.status, 200);
  const approverToken = (await approverTokenResponse.json()) as { access_token: string };

  const approveResponse = await fetch(
    `http://127.0.0.1:8889/v1/break-glass/${requestBody.request.id}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${approverToken.access_token}`,
      },
      body: JSON.stringify({ note: "Emergency use approved for recovery window." }),
    },
  );
  assert.equal(approveResponse.status, 200);

  const approvedAccessResponse = await fetch("http://127.0.0.1:8889/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requesterToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/breakglass`,
      breakGlassId: requestBody.request.id,
    }),
  });
  assert.equal(approvedAccessResponse.status, 200);
  const approvedDecision = (await approvedAccessResponse.json()) as { decision: string };
  assert.equal(approvedDecision.decision, "allowed");

  delete process.env.KEYLORE_TEST_SECRET;
  await server.close();
  await target.close();
  await close();
});

test("egress policy blocks private address literals even when policy and credential metadata allow them", async () => {
  const { app, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "metadata-demo",
          displayName: "Metadata Demo",
          service: "cloud",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "critical",
          allowedDomains: ["169.254.169.254"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Metadata endpoint test",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
          },
          tags: ["egress"],
          status: "active",
        },
      ],
    },
    policies: {
      version: 1,
      rules: [
        {
          id: "allow-private-ip",
          effect: "allow",
          description: "Allow demo metadata read",
          principals: ["admin-client"],
          principalRoles: ["admin"],
          credentialIds: ["metadata-demo"],
          operations: ["http.get"],
          domainPatterns: ["169.254.169.254"],
          environments: ["test"],
        },
      ],
    },
    configOverrides: {
      httpPort: 8890,
      publicBaseUrl: "http://127.0.0.1:8890",
      oauthIssuerUrl: "http://127.0.0.1:8890/oauth",
    },
  });
  const server = await startHttpServer(app);

  const adminTokenResponse = await fetch("http://127.0.0.1:8890/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "broker:use",
      resource: "http://127.0.0.1:8890/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const simulateResponse = await fetch("http://127.0.0.1:8890/v1/access/simulate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "metadata-demo",
      operation: "http.get",
      targetUrl: "https://169.254.169.254/latest/meta-data",
    }),
  });
  assert.equal(simulateResponse.status, 200);
  const simulateBody = (await simulateResponse.json()) as { decision: string; reason: string };
  assert.equal(simulateBody.decision, "denied");
  assert.match(simulateBody.reason, /blocked private|link-local/i);

  await server.close();
  await close();
});

test("sandbox runtime rejects reserved environment overrides", async () => {
  process.env.KEYLORE_TEST_SECRET = "sandbox-secret";
  const { app, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "sandbox-guarded",
          displayName: "Sandbox Guarded",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "high",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Sandbox guardrail credential",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
            injectionEnvName: "SANDBOX_TOKEN",
          },
          tags: ["sandbox"],
          status: "active",
        },
      ],
    },
    configOverrides: {
      httpPort: 8891,
      publicBaseUrl: "http://127.0.0.1:8891",
      oauthIssuerUrl: "http://127.0.0.1:8891/oauth",
      sandboxInjectionEnabled: true,
      sandboxCommandAllowlist: [process.execPath],
    },
  });
  const server = await startHttpServer(app);

  const adminTokenResponse = await fetch("http://127.0.0.1:8891/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "sandbox:run",
      resource: "http://127.0.0.1:8891/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const runtimeResponse = await fetch("http://127.0.0.1:8891/v1/runtime/sandbox", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "sandbox-guarded",
      command: process.execPath,
      args: ["-e", "console.log('noop')"],
      env: {
        SANDBOX_TOKEN: "fake-secret",
      },
    }),
  });
  assert.equal(runtimeResponse.status, 400);
  const runtimeBody = (await runtimeResponse.json()) as { error: string };
  assert.match(runtimeBody.error, /reserved/i);

  delete process.env.KEYLORE_TEST_SECRET;
  await server.close();
  await close();
});

test("backup endpoints export, inspect, and restore with the backup operator role", async () => {
  const { app, broker, close } = await makeTestApp({
    authClients: [
      {
        clientId: "backup-client",
        displayName: "Backup Client",
        roles: ["backup_operator"],
        allowedScopes: ["backup:read", "backup:write"],
        status: "active",
        clientSecret: "backup-secret",
      },
      {
        clientId: "auth-admin-only",
        displayName: "Auth Admin Only",
        roles: ["auth_admin"],
        allowedScopes: ["auth:read", "auth:write"],
        status: "active",
        clientSecret: "auth-admin-only-secret",
      },
    ],
    configOverrides: {
      httpPort: 8892,
      publicBaseUrl: "http://127.0.0.1:8892",
      oauthIssuerUrl: "http://127.0.0.1:8892/oauth",
    },
  });
  const server = await startHttpServer(app);

  const backupTokenResponse = await fetch("http://127.0.0.1:8892/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "backup-client",
      client_secret: "backup-secret",
      scope: "backup:read backup:write",
      resource: "http://127.0.0.1:8892/v1",
    }),
  });
  assert.equal(backupTokenResponse.status, 200);
  const backupToken = (await backupTokenResponse.json()) as { access_token: string };

  const exportResponse = await fetch("http://127.0.0.1:8892/v1/system/backups/export", {
    method: "POST",
    headers: {
      authorization: `Bearer ${backupToken.access_token}`,
    },
  });
  assert.equal(exportResponse.status, 200);
  const exportBody = (await exportResponse.json()) as {
    backup: { credentials: Array<{ id: string }> };
    summary: { credentials: number };
  };
  assert.equal(exportBody.summary.credentials >= 1, true);

  const inspectResponse = await fetch("http://127.0.0.1:8892/v1/system/backups/inspect", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${backupToken.access_token}`,
    },
    body: JSON.stringify({ backup: exportBody.backup }),
  });
  assert.equal(inspectResponse.status, 200);
  const inspectBody = (await inspectResponse.json()) as { backup: { credentials: number } };
  assert.equal(inspectBody.backup.credentials, exportBody.summary.credentials);

  await broker.deleteCredential(localOperatorContext("local-operator"), "demo");
  assert.equal((await broker.getCredential(localOperatorContext("local-operator"), "demo")) === undefined, true);

  const restoreResponse = await fetch("http://127.0.0.1:8892/v1/system/backups/restore", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${backupToken.access_token}`,
    },
    body: JSON.stringify({
      confirm: true,
      backup: exportBody.backup,
    }),
  });
  assert.equal(restoreResponse.status, 200);
  assert.equal((await broker.getCredential(localOperatorContext("local-operator"), "demo"))?.id, "demo");

  const authAdminTokenResponse = await fetch("http://127.0.0.1:8892/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "auth-admin-only",
      client_secret: "auth-admin-only-secret",
      scope: "auth:read auth:write",
      resource: "http://127.0.0.1:8892/v1",
    }),
  });
  assert.equal(authAdminTokenResponse.status, 200);
  const authAdminToken = (await authAdminTokenResponse.json()) as { access_token: string };

  const forbiddenBackupResponse = await fetch("http://127.0.0.1:8892/v1/system/backups/export", {
    method: "POST",
    headers: {
      authorization: `Bearer ${authAdminToken.access_token}`,
    },
  });
  assert.equal(forbiddenBackupResponse.status, 403);

  await server.close();
  await close();
});

test("audit endpoint requires an auditor or admin role even when the scope is present", async () => {
  const { app, close } = await makeTestApp({
    authClients: [
      {
        clientId: "consumer-audit-client",
        displayName: "Consumer Audit Client",
        roles: ["consumer"],
        allowedScopes: ["audit:read"],
        status: "active",
        clientSecret: "consumer-audit-secret",
      },
    ],
    configOverrides: {
      httpPort: 8880,
      publicBaseUrl: "http://127.0.0.1:8880",
      oauthIssuerUrl: "http://127.0.0.1:8880/oauth",
    },
  });
  const server = await startHttpServer(app);

  const tokenResponse = await fetch("http://127.0.0.1:8880/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "consumer-audit-client",
      client_secret: "consumer-audit-secret",
      scope: "audit:read",
      resource: "http://127.0.0.1:8880/v1",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const token = (await tokenResponse.json()) as { access_token: string };

  const auditResponse = await fetch("http://127.0.0.1:8880/v1/audit/events?limit=5", {
    headers: {
      authorization: `Bearer ${token.access_token}`,
    },
  });
  assert.equal(auditResponse.status, 403);
  const body = (await auditResponse.json()) as { error: string };
  assert.match(body.error, /required role/i);

  await server.close();
  await close();
});
