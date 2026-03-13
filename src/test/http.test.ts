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
