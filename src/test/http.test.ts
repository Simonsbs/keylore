import assert from "node:assert/strict";
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  KeyObject,
  randomUUID,
  sign as signWithKey,
} from "node:crypto";
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

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function makeClientAssertion(
  privateKey: KeyObject,
  clientId: string,
  audience: string,
  jti = randomUUID(),
): string {
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      iss: clientId,
      sub: clientId,
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 300,
      iat: Math.floor(Date.now() / 1000),
      jti,
    }),
  );
  const body = `${header}.${payload}`;
  const signature = signWithKey("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
  return `${body}.${signature}`;
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

test("root path redirects to the admin ui", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8869,
      publicBaseUrl: "http://127.0.0.1:8869",
      oauthIssuerUrl: "http://127.0.0.1:8869/oauth",
    },
  });
  const server = await startHttpServer(app);

  try {
    const response = await fetch("http://127.0.0.1:8869/", {
      redirect: "manual",
    });

    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "/admin");
  } finally {
    await server.close();
    await close();
  }
});

test("local quickstart session can be opened server-side without exposing the bootstrap secret", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8870,
      publicBaseUrl: "http://127.0.0.1:8870",
      oauthIssuerUrl: "http://127.0.0.1:8870/oauth",
      localQuickstartEnabled: true,
      localQuickstartBootstrap: {
        clientId: "admin-client",
        clientSecret: "admin-secret",
        scopes: ["catalog:read", "admin:read", "broker:use"],
      },
      localAdminBootstrap: undefined,
    },
  });
  const server = await startHttpServer(app);

  try {
    const response = await fetch("http://127.0.0.1:8870/v1/core/local-session", {
      method: "POST",
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as Record<string, string | boolean>;
    assert.equal(payload.quickstart, true);
    assert.equal(payload.clientId, "admin-client");
    assert.equal(payload.resource, "http://127.0.0.1:8870/v1");
    assert.match(String(payload.access_token), /^[A-Za-z0-9_-]+$/);

    const catalogResponse = await fetch("http://127.0.0.1:8870/v1/catalog/credentials", {
      headers: {
        authorization: `Bearer ${String(payload.access_token)}`,
      },
    });

    assert.equal(catalogResponse.status, 200);
  } finally {
    await server.close();
    await close();
  }
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
          tenantId: "default",
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

test("approval review quorum requires distinct approvers before access is granted", async () => {
  process.env.KEYLORE_TEST_SECRET = "phase2-quorum-secret";
  const target = await startLocalTargetServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  const { app, close } = await makeTestApp({
    policies: {
      version: 1,
      rules: [
        {
          id: "approval-quorum-demo",
          tenantId: "default",
          effect: "approval",
          description: "Needs quorum approval",
          principals: ["consumer-client"],
          principalRoles: ["consumer"],
          credentialIds: ["demo"],
          operations: ["http.get"],
          domainPatterns: ["localhost"],
          environments: ["test"],
        },
      ],
    },
    authClients: [
      {
        clientId: "consumer-client",
        displayName: "Consumer Client",
        roles: ["consumer"],
        allowedScopes: ["broker:use"],
        status: "active",
        clientSecret: "consumer-secret",
      },
      {
        clientId: "approver-one",
        displayName: "Approver One",
        roles: ["approver"],
        allowedScopes: ["approval:read", "approval:review"],
        status: "active",
        clientSecret: "approver-one-secret",
      },
      {
        clientId: "approver-two",
        displayName: "Approver Two",
        roles: ["approver"],
        allowedScopes: ["approval:read", "approval:review"],
        status: "active",
        clientSecret: "approver-two-secret",
      },
    ],
    configOverrides: {
      approvalReviewQuorum: 2,
      httpPort: 8879,
      publicBaseUrl: "http://127.0.0.1:8879",
      oauthIssuerUrl: "http://127.0.0.1:8879/oauth",
    },
  });
  const server = await startHttpServer(app);

  const consumerTokenResponse = await fetch("http://127.0.0.1:8879/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "consumer-client",
      client_secret: "consumer-secret",
      scope: "broker:use",
      resource: "http://127.0.0.1:8879/v1",
    }),
  });
  assert.equal(consumerTokenResponse.status, 200);
  const consumerToken = (await consumerTokenResponse.json()) as { access_token: string };

  const approvalResponse = await fetch("http://127.0.0.1:8879/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${consumerToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/quorum-approved`,
    }),
  });
  assert.equal(approvalResponse.status, 200);
  const approvalDecision = (await approvalResponse.json()) as {
    decision: string;
    approvalRequestId?: string;
  };
  assert.equal(approvalDecision.decision, "approval_required");
  assert.ok(approvalDecision.approvalRequestId);

  const approverOneTokenResponse = await fetch("http://127.0.0.1:8879/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "approver-one",
      client_secret: "approver-one-secret",
      scope: "approval:read approval:review",
      resource: "http://127.0.0.1:8879/v1",
    }),
  });
  assert.equal(approverOneTokenResponse.status, 200);
  const approverOneToken = (await approverOneTokenResponse.json()) as { access_token: string };

  const firstApprovalResponse = await fetch(
    `http://127.0.0.1:8879/v1/approvals/${approvalDecision.approvalRequestId}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${approverOneToken.access_token}`,
      },
      body: JSON.stringify({ note: "first approval" }),
    },
  );
  assert.equal(firstApprovalResponse.status, 200);
  const firstApprovalPayload = (await firstApprovalResponse.json()) as {
    approval: { status: string; approvalCount: number; requiredApprovals: number };
  };
  assert.equal(firstApprovalPayload.approval.status, "pending");
  assert.equal(firstApprovalPayload.approval.approvalCount, 1);
  assert.equal(firstApprovalPayload.approval.requiredApprovals, 2);

  const duplicateApprovalResponse = await fetch(
    `http://127.0.0.1:8879/v1/approvals/${approvalDecision.approvalRequestId}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${approverOneToken.access_token}`,
      },
      body: JSON.stringify({ note: "duplicate approval" }),
    },
  );
  assert.equal(duplicateApprovalResponse.status, 409);

  const approverTwoTokenResponse = await fetch("http://127.0.0.1:8879/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "approver-two",
      client_secret: "approver-two-secret",
      scope: "approval:read approval:review",
      resource: "http://127.0.0.1:8879/v1",
    }),
  });
  assert.equal(approverTwoTokenResponse.status, 200);
  const approverTwoToken = (await approverTwoTokenResponse.json()) as { access_token: string };

  const finalApprovalResponse = await fetch(
    `http://127.0.0.1:8879/v1/approvals/${approvalDecision.approvalRequestId}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${approverTwoToken.access_token}`,
      },
      body: JSON.stringify({ note: "second approval" }),
    },
  );
  assert.equal(finalApprovalResponse.status, 200);
  const finalApprovalPayload = (await finalApprovalResponse.json()) as {
    approval: { status: string; approvalCount: number };
  };
  assert.equal(finalApprovalPayload.approval.status, "approved");
  assert.equal(finalApprovalPayload.approval.approvalCount, 2);

  const approvedAccess = await fetch("http://127.0.0.1:8879/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${consumerToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/quorum-approved`,
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
          tenantId: "default",
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

test("core credential onboarding stores a local secret and creates a usable credential", async () => {
  const target = await startLocalTargetServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        authorized: req.headers.authorization === "Bearer ghp-local-test-token",
      }),
    );
  });

  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8911,
      publicBaseUrl: "http://127.0.0.1:8911",
      oauthIssuerUrl: "http://127.0.0.1:8911/oauth",
    },
  });
  const server = await startHttpServer(app);

  const tokenResponse = await fetch("http://127.0.0.1:8911/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "catalog:read catalog:write broker:use",
      resource: "http://127.0.0.1:8911/v1",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const tokenPayload = (await tokenResponse.json()) as { access_token: string };

  const createResponse = await fetch("http://127.0.0.1:8911/v1/core/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "github-local",
      displayName: "GitHub Local",
      service: "github",
      allowedDomains: ["localhost"],
      selectionNotes: "Use for local broker validation only.",
      secretSource: {
        adapter: "local",
        secretValue: "ghp-local-test-token",
      },
    }),
  });
  assert.equal(createResponse.status, 201);

  const accessResponse = await fetch("http://127.0.0.1:8911/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "github-local",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/github`,
    }),
  });
  assert.equal(accessResponse.status, 200);
  const decision = (await accessResponse.json()) as {
    decision: string;
    httpResult?: {
      bodyPreview: string;
    };
  };
  assert.equal(decision.decision, "allowed");
  assert.match(decision.httpResult?.bodyPreview ?? "", /true/);

  await target.close();
  await server.close();
  await close();
});

test("core credential delete removes the credential and local secret", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8915,
      publicBaseUrl: "http://127.0.0.1:8915",
      oauthIssuerUrl: "http://127.0.0.1:8915/oauth",
    },
  });
  const server = await startHttpServer(app);

  const tokenResponse = await fetch("http://127.0.0.1:8915/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "catalog:read catalog:write broker:use",
      resource: "http://127.0.0.1:8915/v1",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const tokenPayload = (await tokenResponse.json()) as { access_token: string };

  const createResponse = await fetch("http://127.0.0.1:8915/v1/core/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "delete-demo",
      displayName: "Delete Demo",
      service: "github",
      allowedDomains: ["api.github.com"],
      selectionNotes: "Use for delete validation only.",
      secretSource: {
        adapter: "local",
        secretValue: "ghp-delete-demo",
      },
    }),
  });
  assert.equal(createResponse.status, 201);

  const deleteResponse = await fetch("http://127.0.0.1:8915/v1/core/credentials/delete-demo", {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });
  assert.equal(deleteResponse.status, 200);
  const deletePayload = (await deleteResponse.json()) as { deleted: boolean };
  assert.equal(deletePayload.deleted, true);

  const credentialResponse = await fetch("http://127.0.0.1:8915/v1/catalog/credentials", {
    headers: {
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });
  assert.equal(credentialResponse.status, 200);
  const credentialPayload = (await credentialResponse.json()) as { credentials: Array<{ id: string }> };
  assert.equal(credentialPayload.credentials.some((credential) => credential.id === "delete-demo"), false);

  await server.close();
  await close();
});

test("core MCP connection check validates a resource-bound MCP token", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8912,
      publicBaseUrl: "http://127.0.0.1:8912",
      oauthIssuerUrl: "http://127.0.0.1:8912/oauth",
    },
  });
  const server = await startHttpServer(app);

  const apiTokenResponse = await fetch("http://127.0.0.1:8912/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "catalog:read",
      resource: "http://127.0.0.1:8912/v1",
    }),
  });
  assert.equal(apiTokenResponse.status, 200);
  const apiToken = (await apiTokenResponse.json()) as { access_token: string };

  const mcpTokenResponse = await fetch("http://127.0.0.1:8912/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "catalog:read broker:use mcp:use",
      resource: "http://127.0.0.1:8912/mcp",
    }),
  });
  assert.equal(mcpTokenResponse.status, 200);
  const mcpToken = (await mcpTokenResponse.json()) as { access_token: string };

  const checkResponse = await fetch("http://127.0.0.1:8912/v1/core/mcp/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiToken.access_token}`,
    },
    body: JSON.stringify({
      token: mcpToken.access_token,
    }),
  });
  assert.equal(checkResponse.status, 200);
  const checkPayload = (await checkResponse.json()) as {
    ok: boolean;
    resource: string;
    scopes: string[];
  };
  assert.equal(checkPayload.ok, true);
  assert.equal(checkPayload.resource, "http://127.0.0.1:8912/mcp");
  assert.ok(checkPayload.scopes.includes("mcp:use"));

  await server.close();
  await close();
});

test("core credential onboarding rejects vague or secret-like selection notes", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8913,
      publicBaseUrl: "http://127.0.0.1:8913",
      oauthIssuerUrl: "http://127.0.0.1:8913/oauth",
    },
  });
  const server = await startHttpServer(app);
  try {
    const tokenResponse = await fetch("http://127.0.0.1:8913/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "admin-client",
        client_secret: "admin-secret",
        scope: "catalog:read catalog:write broker:use",
        resource: "http://127.0.0.1:8913/v1",
      }),
    });
    assert.equal(tokenResponse.status, 200);
    const tokenPayload = (await tokenResponse.json()) as { access_token: string };

    const createResponse = await fetch("http://127.0.0.1:8913/v1/core/credentials", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenPayload.access_token}`,
      },
      body: JSON.stringify({
        credentialId: "bad-context",
        displayName: "Bad Context",
        service: "github",
        allowedDomains: ["api.github.com"],
        selectionNotes: "ghp_super_secret_token",
        secretSource: {
          adapter: "local",
          secretValue: "ghp-local-test-token",
        },
      }),
    });
    assert.equal(createResponse.status, 400);
    const errorPayload = (await createResponse.json()) as { error?: string };
    assert.match(errorPayload.error ?? "", /Selection notes/i);
  } finally {
    await server.close();
    await close();
  }
});

test("core credential context endpoints inspect and update metadata without exposing bindings", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8914,
      publicBaseUrl: "http://127.0.0.1:8914",
      oauthIssuerUrl: "http://127.0.0.1:8914/oauth",
    },
  });
  const server = await startHttpServer(app);

  try {
    const tokenResponse = await fetch("http://127.0.0.1:8914/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: "admin-client",
        client_secret: "admin-secret",
        scope: "catalog:read catalog:write broker:use",
        resource: "http://127.0.0.1:8914/v1",
      }),
    });
    assert.equal(tokenResponse.status, 200);
    const tokenPayload = (await tokenResponse.json()) as { access_token: string };

    const createResponse = await fetch("http://127.0.0.1:8914/v1/core/credentials", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokenPayload.access_token}`,
      },
      body: JSON.stringify({
        credentialId: "context-demo",
        displayName: "Context Demo",
        service: "github",
        allowedDomains: ["api.github.com"],
        selectionNotes: "Use for GitHub repository metadata reads only.",
        secretSource: {
          adapter: "local",
          secretValue: "ghp-local-test-token",
        },
      }),
    });
    assert.equal(createResponse.status, 201);

    const getResponse = await fetch(
      "http://127.0.0.1:8914/v1/core/credentials/context-demo/context",
      {
        headers: {
          authorization: `Bearer ${tokenPayload.access_token}`,
        },
      },
    );
    assert.equal(getResponse.status, 200);
    const getPayload = (await getResponse.json()) as {
      credential: Record<string, unknown> & { selectionNotes: string };
    };
    assert.equal(getPayload.credential.selectionNotes, "Use for GitHub repository metadata reads only.");
    assert.equal("binding" in getPayload.credential, false);

    const patchResponse = await fetch(
      "http://127.0.0.1:8914/v1/core/credentials/context-demo/context",
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${tokenPayload.access_token}`,
        },
        body: JSON.stringify({
          selectionNotes:
            "Use for GitHub repository metadata, issue lookup, and pull request reads. Avoid write actions.",
          tags: ["github", "readonly", "managed"],
          permittedOperations: ["http.get"],
          allowedDomains: ["api.github.com"],
          scopeTier: "read_only",
        }),
      },
    );
    assert.equal(patchResponse.status, 200);
    const patchPayload = (await patchResponse.json()) as {
      credential: { selectionNotes: string; tags: string[]; status: string };
    };
    assert.match(patchPayload.credential.selectionNotes, /Avoid write actions/);
    assert.deepEqual(patchPayload.credential.tags, ["github", "readonly", "managed"]);
    assert.equal(patchPayload.credential.status, "active");
  } finally {
    await server.close();
    await close();
  }
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

test("oauth token endpoint supports private_key_jwt clients and blocks assertion replay", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const exportedJwk = publicKey.export({ format: "jwk" }) as {
    kty: string;
    n: string;
    e: string;
  };
  const publicJwk = {
    ...exportedJwk,
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };

  const { app, close } = await makeTestApp({
    authClients: [
      {
        clientId: "jwt-client",
        displayName: "JWT Client",
        roles: ["consumer"],
        allowedScopes: ["catalog:read"],
        status: "active",
        tokenEndpointAuthMethod: "private_key_jwt",
        jwks: [publicJwk],
      },
    ],
    configOverrides: {
      httpPort: 8883,
      publicBaseUrl: "http://127.0.0.1:8883",
      oauthIssuerUrl: "http://127.0.0.1:8883/oauth",
    },
  });
  const server = await startHttpServer(app);

  const assertion = makeClientAssertion(privateKey, "jwt-client", "http://127.0.0.1:8883/oauth");
  const tokenResponse = await fetch("http://127.0.0.1:8883/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "jwt-client",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      scope: "catalog:read",
      resource: "http://127.0.0.1:8883/v1",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const token = (await tokenResponse.json()) as { access_token: string };
  assert.ok(token.access_token.length > 10);

  const replayResponse = await fetch("http://127.0.0.1:8883/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "jwt-client",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: assertion,
      scope: "catalog:read",
      resource: "http://127.0.0.1:8883/v1",
    }),
  });
  assert.equal(replayResponse.status, 409);

  const searchResponse = await fetch("http://127.0.0.1:8883/v1/catalog/credentials", {
    headers: {
      authorization: `Bearer ${token.access_token}`,
    },
  });
  assert.equal(searchResponse.status, 200);

  await server.close();
  await close();
});

test("authorization_code with PKCE issues refreshable user-bound tokens for public clients", async () => {
  const { app, auth, close } = await makeTestApp({
    authClients: [
      {
        clientId: "interactive-admin",
        tenantId: "default",
        displayName: "Interactive Admin",
        roles: ["admin", "auth_admin"],
        allowedScopes: ["auth:read", "auth:write", "catalog:read", "mcp:use"],
        status: "active",
        clientSecret: "interactive-admin-secret",
      },
      {
        clientId: "public-mcp-client",
        tenantId: "default",
        displayName: "Public MCP Client",
        roles: ["admin"],
        allowedScopes: ["catalog:read", "mcp:use"],
        status: "active",
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["http://127.0.0.1/callback"],
      },
    ],
    configOverrides: {
      httpPort: 8884,
      publicBaseUrl: "http://127.0.0.1:8884",
      oauthIssuerUrl: "http://127.0.0.1:8884/oauth",
    },
  });
  const server = await startHttpServer(app);

  const actorToken = await auth.issueToken({
    clientId: "interactive-admin",
    clientSecret: "interactive-admin-secret",
    grantType: "client_credentials",
    scope: ["auth:read", "auth:write", "catalog:read", "mcp:use"],
    resource: "http://127.0.0.1:8884/v1",
  });

  const verifier = "pkce-verifier-for-public-client-1234567890abcdef";
  const authorizeResponse = await fetch("http://127.0.0.1:8884/oauth/authorize", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${actorToken.access_token}`,
    },
    body: JSON.stringify({
      clientId: "public-mcp-client",
      redirectUri: "http://127.0.0.1/callback",
      scope: ["catalog:read", "mcp:use"],
      resource: "http://127.0.0.1:8884/v1",
      codeChallenge: pkceChallenge(verifier),
      codeChallengeMethod: "S256",
      state: "pkce-state",
    }),
  });
  assert.equal(authorizeResponse.status, 200);
  const authorization = (await authorizeResponse.json()) as {
    code: string;
    scope: string;
    subject: string;
  };
  assert.equal(authorization.subject, "interactive-admin");
  assert.equal(authorization.scope, "catalog:read mcp:use");

  const tokenResponse = await fetch("http://127.0.0.1:8884/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "public-mcp-client",
      code: authorization.code,
      code_verifier: verifier,
      redirect_uri: "http://127.0.0.1/callback",
    }),
  });
  assert.equal(tokenResponse.status, 200);
  const tokenPayload = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
  };
  assert.ok(tokenPayload.access_token.length > 10);
  assert.ok(tokenPayload.refresh_token.length > 10);

  const catalogResponse = await fetch("http://127.0.0.1:8884/v1/catalog/credentials", {
    headers: {
      authorization: `Bearer ${tokenPayload.access_token}`,
    },
  });
  assert.equal(catalogResponse.status, 200);

  const refreshResponse = await fetch("http://127.0.0.1:8884/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "public-mcp-client",
      refresh_token: tokenPayload.refresh_token,
    }),
  });
  assert.equal(refreshResponse.status, 200);
  const refreshed = (await refreshResponse.json()) as {
    access_token: string;
    refresh_token: string;
  };
  assert.ok(refreshed.access_token.length > 10);
  assert.notEqual(refreshed.refresh_token, tokenPayload.refresh_token);

  const refreshListResponse = await fetch("http://127.0.0.1:8884/v1/auth/refresh-tokens", {
    headers: {
      authorization: `Bearer ${actorToken.access_token}`,
    },
  });
  assert.equal(refreshListResponse.status, 200);
  const refreshListPayload = (await refreshListResponse.json()) as {
    tokens: Array<{ subject: string; clientId: string }>;
  };
  assert.equal(
    refreshListPayload.tokens.some(
      (token) => token.clientId === "public-mcp-client" && token.subject === "interactive-admin",
    ),
    true,
  );

  await server.close();
  await close();
});

test("tenant-scoped tokens are isolated across auth, catalog, and write operations", async () => {
  const { app, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "tenant-a-demo",
          tenantId: "tenant-a",
          displayName: "Tenant A Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "high",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Tenant A credential",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
          },
          tags: ["tenant-a"],
          status: "active",
        },
        {
          id: "tenant-b-demo",
          tenantId: "tenant-b",
          displayName: "Tenant B Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "high",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Tenant B credential",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
          },
          tags: ["tenant-b"],
          status: "active",
        },
      ],
    },
    policies: {
      version: 1,
      rules: [],
    },
    authClients: [
      {
        clientId: "tenant-a-admin",
        tenantId: "tenant-a",
        displayName: "Tenant A Admin",
        roles: ["admin", "auth_admin"],
        allowedScopes: ["auth:read", "auth:write", "catalog:read", "catalog:write", "broker:use"],
        status: "active",
        clientSecret: "tenant-a-admin-secret",
      },
      {
        clientId: "tenant-a-consumer",
        tenantId: "tenant-a",
        displayName: "Tenant A Consumer",
        roles: ["consumer"],
        allowedScopes: ["catalog:read", "broker:use"],
        status: "active",
        clientSecret: "tenant-a-consumer-secret",
      },
      {
        clientId: "tenant-b-admin",
        tenantId: "tenant-b",
        displayName: "Tenant B Admin",
        roles: ["admin", "auth_admin"],
        allowedScopes: ["auth:read", "auth:write", "catalog:read", "catalog:write", "broker:use"],
        status: "active",
        clientSecret: "tenant-b-admin-secret",
      },
    ],
    configOverrides: {
      httpPort: 8898,
      publicBaseUrl: "http://127.0.0.1:8898",
      oauthIssuerUrl: "http://127.0.0.1:8898/oauth",
    },
  });
  const server = await startHttpServer(app);

  const tenantAAdminTokenResponse = await fetch("http://127.0.0.1:8898/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "tenant-a-admin",
      client_secret: "tenant-a-admin-secret",
      scope: "auth:read auth:write catalog:read catalog:write broker:use",
      resource: "http://127.0.0.1:8898/v1",
    }),
  });
  assert.equal(tenantAAdminTokenResponse.status, 200);
  const tenantAAdminToken = (await tenantAAdminTokenResponse.json()) as { access_token: string };

  const tenantAConsumerTokenResponse = await fetch("http://127.0.0.1:8898/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "tenant-a-consumer",
      client_secret: "tenant-a-consumer-secret",
      scope: "catalog:read broker:use",
      resource: "http://127.0.0.1:8898/v1",
    }),
  });
  assert.equal(tenantAConsumerTokenResponse.status, 200);
  const tenantAConsumerToken = (await tenantAConsumerTokenResponse.json()) as { access_token: string };

  const clientListResponse = await fetch("http://127.0.0.1:8898/v1/auth/clients", {
    headers: {
      authorization: `Bearer ${tenantAAdminToken.access_token}`,
    },
  });
  assert.equal(clientListResponse.status, 200);
  const clientListPayload = (await clientListResponse.json()) as {
    clients: Array<{ clientId: string; tenantId: string }>;
  };
  assert.deepEqual(
    clientListPayload.clients.map((client) => client.clientId).sort(),
    ["tenant-a-admin", "tenant-a-consumer"],
  );
  assert.equal(clientListPayload.clients.every((client) => client.tenantId === "tenant-a"), true);

  const catalogListResponse = await fetch("http://127.0.0.1:8898/v1/catalog/credentials", {
    headers: {
      authorization: `Bearer ${tenantAConsumerToken.access_token}`,
    },
  });
  assert.equal(catalogListResponse.status, 200);
  const catalogListPayload = (await catalogListResponse.json()) as {
    credentials: Array<{ id: string; tenantId: string }>;
  };
  assert.deepEqual(catalogListPayload.credentials.map((credential) => credential.id), ["tenant-a-demo"]);
  assert.equal(catalogListPayload.credentials[0]?.tenantId, "tenant-a");

  const allowedReadResponse = await fetch("http://127.0.0.1:8898/v1/catalog/credentials/tenant-a-demo", {
    headers: {
      authorization: `Bearer ${tenantAConsumerToken.access_token}`,
    },
  });
  assert.equal(allowedReadResponse.status, 200);

  const hiddenReadResponse = await fetch("http://127.0.0.1:8898/v1/catalog/credentials/tenant-b-demo", {
    headers: {
      authorization: `Bearer ${tenantAConsumerToken.access_token}`,
    },
  });
  assert.equal(hiddenReadResponse.status, 404);

  const deniedCreateResponse = await fetch("http://127.0.0.1:8898/v1/catalog/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tenantAAdminToken.access_token}`,
    },
    body: JSON.stringify({
      id: "cross-tenant-write",
      tenantId: "tenant-b",
      displayName: "Cross Tenant Write",
      service: "github",
      owner: "platform",
      scopeTier: "read_only",
      sensitivity: "high",
      allowedDomains: ["localhost"],
      permittedOperations: ["http.get"],
      expiresAt: null,
      rotationPolicy: "30 days",
      lastValidatedAt: null,
      selectionNotes: "Should be blocked",
      binding: {
        adapter: "env",
        ref: "KEYLORE_TEST_SECRET",
        authType: "bearer",
        headerName: "Authorization",
        headerPrefix: "Bearer ",
      },
      tags: ["blocked"],
      status: "active",
    }),
  });
  assert.equal(deniedCreateResponse.status, 403);

  const hiddenAccessResponse = await fetch("http://127.0.0.1:8898/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${tenantAConsumerToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "tenant-b-demo",
      operation: "http.get",
      targetUrl: "http://localhost/hidden",
    }),
  });
  assert.equal(hiddenAccessResponse.status, 200);
  const hiddenAccessDecision = (await hiddenAccessResponse.json()) as {
    decision: string;
    reason: string;
  };
  assert.equal(hiddenAccessDecision.decision, "denied");
  assert.match(hiddenAccessDecision.reason, /Credential not found/i);

  await server.close();
  await close();
});

test("rotation workflow plans due credentials and completes with updated binding state", async () => {
  const { app, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "rotation-demo",
          tenantId: "default",
          displayName: "Rotation Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "high",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Rotation demo credential",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
          },
          tags: ["rotation"],
          status: "active",
        },
      ],
    },
    configOverrides: {
      httpPort: 8894,
      publicBaseUrl: "http://127.0.0.1:8894",
      oauthIssuerUrl: "http://127.0.0.1:8894/oauth",
    },
  });
  const server = await startHttpServer(app);

  const adminTokenResponse = await fetch("http://127.0.0.1:8894/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "system:read system:write",
      resource: "http://127.0.0.1:8894/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const planResponse = await fetch("http://127.0.0.1:8894/v1/system/rotations/plan", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken.access_token}`,
    },
    body: JSON.stringify({ horizonDays: 14, credentialIds: ["rotation-demo"] }),
  });
  assert.equal(planResponse.status, 200);
  const planPayload = (await planResponse.json()) as {
    rotations: Array<{ id: string; status: string; credentialId: string }>;
  };
  assert.equal(planPayload.rotations.length, 1);
  assert.equal(planPayload.rotations[0]?.status, "pending");

  const startResponse = await fetch(
    `http://127.0.0.1:8894/v1/system/rotations/${planPayload.rotations[0]?.id}/start`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken.access_token}`,
      },
      body: JSON.stringify({ note: "begin rotation" }),
    },
  );
  assert.equal(startResponse.status, 200);

  const completeResponse = await fetch(
    `http://127.0.0.1:8894/v1/system/rotations/${planPayload.rotations[0]?.id}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken.access_token}`,
      },
      body: JSON.stringify({
        note: "rotation completed",
        targetRef: "KEYLORE_TEST_SECRET_ROTATED",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    },
  );
  assert.equal(completeResponse.status, 200);
  const completePayload = (await completeResponse.json()) as {
    rotation: { status: string; targetRef?: string };
  };
  assert.equal(completePayload.rotation.status, "completed");
  assert.equal(completePayload.rotation.targetRef, "KEYLORE_TEST_SECRET_ROTATED");

  const credentialRow = await app.database.query<{ binding: { ref: string }; last_validated_at: string | null }>(
    "SELECT binding, last_validated_at FROM credentials WHERE id = $1",
    ["rotation-demo"],
  );
  assert.equal(credentialRow.rows[0]?.binding.ref, "KEYLORE_TEST_SECRET_ROTATED");
  assert.ok(credentialRow.rows[0]?.last_validated_at);

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
          tenantId: "default",
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
      httpPort: 8896,
      publicBaseUrl: "http://127.0.0.1:8896",
      oauthIssuerUrl: "http://127.0.0.1:8896/oauth",
    },
  });
  const server = await startHttpServer(app);

  const adminTokenResponse = await fetch("http://127.0.0.1:8896/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "catalog:read system:read",
      resource: "http://127.0.0.1:8896/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const reportResponse = await fetch("http://127.0.0.1:8896/v1/catalog/credentials/demo/report", {
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

  const adaptersResponse = await fetch("http://127.0.0.1:8896/v1/system/adapters", {
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
          tenantId: "default",
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

test("break-glass review quorum requires distinct approvers before emergency access activates", async () => {
  process.env.KEYLORE_TEST_SECRET = "breakglass-quorum-secret";
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
        clientId: "breakglass-approver-one",
        displayName: "Breakglass Approver One",
        roles: ["approver"],
        allowedScopes: ["breakglass:read", "breakglass:review"],
        status: "active",
        clientSecret: "breakglass-approver-one-secret",
      },
      {
        clientId: "breakglass-approver-two",
        displayName: "Breakglass Approver Two",
        roles: ["approver"],
        allowedScopes: ["breakglass:read", "breakglass:review"],
        status: "active",
        clientSecret: "breakglass-approver-two-secret",
      },
    ],
    configOverrides: {
      breakGlassReviewQuorum: 2,
      httpPort: 8891,
      publicBaseUrl: "http://127.0.0.1:8891",
      oauthIssuerUrl: "http://127.0.0.1:8891/oauth",
    },
  });
  const server = await startHttpServer(app);

  const requesterTokenResponse = await fetch("http://127.0.0.1:8891/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "breakglass-requester",
      client_secret: "breakglass-requester-secret",
      scope: "broker:use breakglass:request breakglass:read",
      resource: "http://127.0.0.1:8891/v1",
    }),
  });
  assert.equal(requesterTokenResponse.status, 200);
  const requesterToken = (await requesterTokenResponse.json()) as { access_token: string };

  const requestResponse = await fetch("http://127.0.0.1:8891/v1/break-glass", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requesterToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/breakglass-quorum`,
      justification: "Emergency package registry access to recover a blocked release pipeline.",
      requestedDurationSeconds: 300,
    }),
  });
  assert.equal(requestResponse.status, 201);
  const requestBody = (await requestResponse.json()) as {
    request: { id: string; status: string; requiredApprovals: number };
  };
  assert.equal(requestBody.request.status, "pending");
  assert.equal(requestBody.request.requiredApprovals, 2);

  const approverOneTokenResponse = await fetch("http://127.0.0.1:8891/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "breakglass-approver-one",
      client_secret: "breakglass-approver-one-secret",
      scope: "breakglass:read breakglass:review",
      resource: "http://127.0.0.1:8891/v1",
    }),
  });
  assert.equal(approverOneTokenResponse.status, 200);
  const approverOneToken = (await approverOneTokenResponse.json()) as { access_token: string };

  const firstApproveResponse = await fetch(
    `http://127.0.0.1:8891/v1/break-glass/${requestBody.request.id}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${approverOneToken.access_token}`,
      },
      body: JSON.stringify({ note: "first breakglass approval" }),
    },
  );
  assert.equal(firstApproveResponse.status, 200);
  const firstApprovePayload = (await firstApproveResponse.json()) as {
    request: { status: string; approvalCount: number; requiredApprovals: number };
  };
  assert.equal(firstApprovePayload.request.status, "pending");
  assert.equal(firstApprovePayload.request.approvalCount, 1);
  assert.equal(firstApprovePayload.request.requiredApprovals, 2);

  const approverTwoTokenResponse = await fetch("http://127.0.0.1:8891/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "breakglass-approver-two",
      client_secret: "breakglass-approver-two-secret",
      scope: "breakglass:read breakglass:review",
      resource: "http://127.0.0.1:8891/v1",
    }),
  });
  assert.equal(approverTwoTokenResponse.status, 200);
  const approverTwoToken = (await approverTwoTokenResponse.json()) as { access_token: string };

  const secondApproveResponse = await fetch(
    `http://127.0.0.1:8891/v1/break-glass/${requestBody.request.id}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${approverTwoToken.access_token}`,
      },
      body: JSON.stringify({ note: "second breakglass approval" }),
    },
  );
  assert.equal(secondApproveResponse.status, 200);
  const secondApprovePayload = (await secondApproveResponse.json()) as {
    request: { status: string; approvalCount: number };
  };
  assert.equal(secondApprovePayload.request.status, "active");
  assert.equal(secondApprovePayload.request.approvalCount, 2);

  const approvedAccessResponse = await fetch("http://127.0.0.1:8891/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${requesterToken.access_token}`,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${target.port}/breakglass-quorum`,
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

test("notification webhooks are signed and traces can be queried by propagated trace id", async () => {
  process.env.KEYLORE_TEST_SECRET = "notify-secret-value";
  const deliveries: Array<{ headers: http.IncomingHttpHeaders; body: string }> = [];
  const webhook = await startLocalTargetServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    deliveries.push({
      headers: req.headers,
      body: Buffer.concat(chunks).toString("utf8"),
    });
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ accepted: true }));
  });

  const { app, close } = await makeTestApp({
    policies: {
      version: 1,
      rules: [
        {
          id: "approval-notify-demo",
          tenantId: "default",
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
      notificationWebhookUrl: `http://127.0.0.1:${webhook.port}/notify`,
      notificationSigningSecret: "notify-signing-secret",
      httpPort: 8895,
      publicBaseUrl: "http://127.0.0.1:8895",
      oauthIssuerUrl: "http://127.0.0.1:8895/oauth",
    },
  });
  const server = await startHttpServer(app);

  const consumerTokenResponse = await fetch("http://127.0.0.1:8895/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "consumer-client",
      client_secret: "consumer-secret",
      scope: "broker:use",
      resource: "http://127.0.0.1:8895/v1",
    }),
  });
  assert.equal(consumerTokenResponse.status, 200);
  const consumerToken = (await consumerTokenResponse.json()) as { access_token: string };

  const traceId = "trace-http-test";
  const approvalResponse = await fetch("http://127.0.0.1:8895/v1/access/request", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${consumerToken.access_token}`,
      "x-trace-id": traceId,
    },
    body: JSON.stringify({
      credentialId: "demo",
      operation: "http.get",
      targetUrl: `http://localhost:${webhook.port}/approval-protected`,
    }),
  });
  assert.equal(approvalResponse.status, 200);
  assert.equal(approvalResponse.headers.get("x-trace-id"), traceId);
  const approvalDecision = (await approvalResponse.json()) as {
    decision: string;
    approvalRequestId?: string;
  };
  assert.equal(approvalDecision.decision, "approval_required");
  assert.ok(approvalDecision.approvalRequestId);

  const adminTokenResponse = await fetch("http://127.0.0.1:8895/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "admin-client",
      client_secret: "admin-secret",
      scope: "approval:read approval:review system:read",
      resource: "http://127.0.0.1:8895/v1",
    }),
  });
  assert.equal(adminTokenResponse.status, 200);
  const adminToken = (await adminTokenResponse.json()) as { access_token: string };

  const reviewResponse = await fetch(
    `http://127.0.0.1:8895/v1/approvals/${approvalDecision.approvalRequestId}/approve`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${adminToken.access_token}`,
        "x-trace-id": traceId,
      },
      body: JSON.stringify({ note: "approved in test" }),
    },
  );
  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewResponse.headers.get("x-trace-id"), traceId);

  assert.equal(deliveries.length >= 3, true);
  const eventTypes = deliveries.map((delivery) => delivery.headers["x-keylore-event-type"]);
  assert.equal(eventTypes.includes("approval.pending"), true);
  assert.equal(eventTypes.includes("approval.reviewed"), true);
  assert.equal(eventTypes.includes("approval.approved"), true);
  const signedDelivery = deliveries.find((delivery) => delivery.headers["x-keylore-event-type"] === "approval.pending");
  assert.ok(signedDelivery);
  assert.equal(
    signedDelivery.headers["x-keylore-signature"],
    createHmac("sha256", "notify-signing-secret").update(signedDelivery.body).digest("hex"),
  );
  assert.equal(
    (JSON.parse(signedDelivery.body) as { traceId?: string }).traceId,
    traceId,
  );

  const tracesResponse = await fetch(`http://127.0.0.1:8895/v1/system/traces?traceId=${traceId}&limit=10`, {
    headers: {
      authorization: `Bearer ${adminToken.access_token}`,
    },
  });
  assert.equal(tracesResponse.status, 200);
  const tracesPayload = (await tracesResponse.json()) as {
    traces: Array<{ traceId: string; name: string }>;
  };
  assert.equal(tracesPayload.traces.some((span) => span.traceId === traceId && span.name === "http.request"), true);

  delete process.env.KEYLORE_TEST_SECRET;
  await server.close();
  await webhook.close();
  await close();
});

test("egress policy blocks private address literals even when policy and credential metadata allow them", async () => {
  const { app, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "metadata-demo",
          tenantId: "default",
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
          tenantId: "default",
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
          tenantId: "default",
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
      httpPort: 8893,
      publicBaseUrl: "http://127.0.0.1:8893",
      oauthIssuerUrl: "http://127.0.0.1:8893/oauth",
    },
  });
  const server = await startHttpServer(app);

  const backupTokenResponse = await fetch("http://127.0.0.1:8893/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "backup-client",
      client_secret: "backup-secret",
      scope: "backup:read backup:write",
      resource: "http://127.0.0.1:8893/v1",
    }),
  });
  assert.equal(backupTokenResponse.status, 200);
  const backupToken = (await backupTokenResponse.json()) as { access_token: string };

  const exportResponse = await fetch("http://127.0.0.1:8893/v1/system/backups/export", {
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

  const inspectResponse = await fetch("http://127.0.0.1:8893/v1/system/backups/inspect", {
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

  const restoreResponse = await fetch("http://127.0.0.1:8893/v1/system/backups/restore", {
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

  const authAdminTokenResponse = await fetch("http://127.0.0.1:8893/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "auth-admin-only",
      client_secret: "auth-admin-only-secret",
      scope: "auth:read auth:write",
      resource: "http://127.0.0.1:8893/v1",
    }),
  });
  assert.equal(authAdminTokenResponse.status, 200);
  const authAdminToken = (await authAdminTokenResponse.json()) as { access_token: string };

  const forbiddenBackupResponse = await fetch("http://127.0.0.1:8893/v1/system/backups/export", {
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
