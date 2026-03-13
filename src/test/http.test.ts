import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { authContextFromToken } from "../services/auth-context.js";
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
      scope: "admin:read admin:write catalog:read",
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
      scope: "catalog:read admin:read",
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
