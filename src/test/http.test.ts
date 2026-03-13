import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

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
  const { app, close } = await makeTestApp({
    configOverrides: {
      maxRequestBytes: 128,
      httpPort: 8877,
    },
  });
  const server = await startHttpServer(app);

  const response = await fetch("http://127.0.0.1:8877/v1/catalog/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
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

  const result = await broker.requestAccess("local-operator", {
    credentialId: "demo",
    operation: "http.get",
    targetUrl: `http://localhost:${target.port}/demo`,
  });

  assert.equal(result.decision, "allowed");
  assert.ok(result.httpResult);
  assert.equal(result.httpResult.bodyPreview.includes("super-secret-value"), false);
  assert.equal(result.httpResult.bodyTruncated, true);
  assert.match(result.httpResult.bodyPreview, /REDACTED/);

  delete process.env.KEYLORE_TEST_SECRET;
  await target.close();
  await close();
});
