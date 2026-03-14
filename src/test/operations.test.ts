import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { startHttpServer } from "../http/server.js";
import { localOperatorContext } from "../services/auth-context.js";
import { createInMemoryDatabase } from "../storage/in-memory-database.js";
import { runMigrations } from "../storage/migrations.js";
import { makeTestApp } from "./helpers.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../..");
const migrationsDir = path.join(repoRoot, "migrations");

test("metrics endpoint exposes request telemetry and maintenance status endpoints operate", async () => {
  const { app, auth, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8885,
      publicBaseUrl: "http://127.0.0.1:8885",
      oauthIssuerUrl: "http://127.0.0.1:8885/oauth",
    },
  });
  const server = await startHttpServer(app);
  const adminToken = await auth.issueToken({
    clientId: "admin-client",
    clientSecret: "admin-secret",
    grantType: "client_credentials",
    scope: ["catalog:read", "system:read", "system:write"],
  });

  const searchResponse = await fetch("http://127.0.0.1:8885/v1/catalog/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken.access_token}`,
    },
    body: JSON.stringify({ query: "demo", limit: 5 }),
  });
  assert.equal(searchResponse.status, 200);

  const maintenanceResponse = await fetch("http://127.0.0.1:8885/v1/system/maintenance", {
    headers: {
      authorization: `Bearer ${adminToken.access_token}`,
    },
  });
  assert.equal(maintenanceResponse.status, 200);
  const maintenancePayload = (await maintenanceResponse.json()) as {
    maintenance: { enabled: boolean };
  };
  assert.equal(maintenancePayload.maintenance.enabled, false);

  const runResponse = await fetch("http://127.0.0.1:8885/v1/system/maintenance/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminToken.access_token}`,
    },
  });
  assert.equal(runResponse.status, 200);
  const runPayload = (await runResponse.json()) as {
    result: {
      approvalsExpired: number;
      breakGlassExpired: number;
      accessTokensExpired: number;
      refreshTokensExpired: number;
      authorizationCodesExpired: number;
      oauthClientAssertionsExpired: number;
      rateLimitBucketsDeleted: number;
    };
  };
  assert.deepEqual(runPayload.result, {
    approvalsExpired: 0,
    breakGlassExpired: 0,
    accessTokensExpired: 0,
    refreshTokensExpired: 0,
    authorizationCodesExpired: 0,
    oauthClientAssertionsExpired: 0,
    rateLimitBucketsDeleted: 0,
  });

  const metricsResponse = await fetch("http://127.0.0.1:8885/metrics");
  assert.equal(metricsResponse.status, 200);
  const metrics = await metricsResponse.text();
  assert.match(metrics, /keylore_http_requests_total\{method="POST",route="\/v1\/catalog\/search",status_class="2xx"\} 1/);
  assert.match(metrics, /keylore_maintenance_runs_total\{outcome="success",task="manual"\} 1/);

  await server.close();
  await close();
});

test("database-backed rate limiting survives across app instances sharing the same database", async () => {
  const sharedDatabase = createInMemoryDatabase();
  await runMigrations(sharedDatabase, migrationsDir);

  const first = await makeTestApp({
    database: sharedDatabase,
    skipMigrations: true,
    configOverrides: {
      httpPort: 8886,
      publicBaseUrl: "http://127.0.0.1:8886",
      oauthIssuerUrl: "http://127.0.0.1:8886/oauth",
      rateLimitMaxRequests: 1,
      rateLimitWindowMs: 60000,
    },
  });
  const serverOne = await startHttpServer(first.app);
  const tokenOne = await first.auth.issueToken({
    clientId: "admin-client",
    clientSecret: "admin-secret",
    grantType: "client_credentials",
    scope: ["catalog:read"],
  });
  const firstResponse = await fetch("http://127.0.0.1:8886/v1/catalog/credentials", {
    headers: {
      authorization: `Bearer ${tokenOne.access_token}`,
    },
  });
  assert.equal(firstResponse.status, 200);
  await serverOne.close();
  await first.close();

  const second = await makeTestApp({
    database: sharedDatabase,
    skipMigrations: true,
    configOverrides: {
      httpPort: 8887,
      publicBaseUrl: "http://127.0.0.1:8887",
      oauthIssuerUrl: "http://127.0.0.1:8887/oauth",
      rateLimitMaxRequests: 1,
      rateLimitWindowMs: 60000,
    },
  });
  const serverTwo = await startHttpServer(second.app);
  const tokenTwo = await second.auth.issueToken({
    clientId: "admin-client",
    clientSecret: "admin-secret",
    grantType: "client_credentials",
    scope: ["catalog:read"],
  });
  const secondResponse = await fetch("http://127.0.0.1:8887/v1/catalog/credentials", {
    headers: {
      authorization: `Bearer ${tokenTwo.access_token}`,
    },
  });
  assert.equal(secondResponse.status, 429);

  await serverTwo.close();
  await second.close();
  await sharedDatabase.close();
});

test("logical backups can be created and restored", async () => {
  const { app, broker, close } = await makeTestApp();
  const backupFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "keylore-backup-")), "backup.json");
  const context = localOperatorContext("local-operator");

  await broker.createCredential(context, {
    id: "backup-demo",
    tenantId: "default",
    displayName: "Backup Demo",
    service: "npm",
    owner: "platform",
    scopeTier: "read_only",
    sensitivity: "moderate",
    allowedDomains: ["registry.npmjs.org"],
    permittedOperations: ["http.get"],
    expiresAt: null,
    rotationPolicy: "30 days",
    lastValidatedAt: null,
    selectionNotes: "Backup test",
    binding: {
      adapter: "env",
      ref: "KEYLORE_TEST_SECRET",
      authType: "bearer",
      headerName: "Authorization",
      headerPrefix: "Bearer ",
      injectionEnvName: "NPM_TOKEN",
    },
    tags: ["backup"],
    status: "active",
  });

  const backup = await app.backup.writeBackup(backupFile);
  assert.equal(backup.credentials.some((credential) => credential.id === "backup-demo"), true);

  await broker.deleteCredential(context, "backup-demo");
  assert.equal((await broker.getCredential(context, "backup-demo")) === undefined, true);

  await app.backup.restoreBackup(backupFile);
  const restored = await broker.getCredential(context, "backup-demo");
  assert.equal(restored?.id, "backup-demo");

  await fs.rm(path.dirname(backupFile), { recursive: true, force: true });
  await close();
});

test("trace exporter status and flush deliver spans to the configured endpoint", async () => {
  const deliveries: Array<{ authorization?: string; payload: unknown }> = [];
  const collector = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    deliveries.push({
      authorization: req.headers.authorization,
      payload: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    });
    res.writeHead(202, { "content-type": "application/json" });
    res.end(JSON.stringify({ accepted: true }));
  });
  await new Promise<void>((resolve) => collector.listen(0, "127.0.0.1", resolve));
  const address = collector.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to determine collector port.");
  }

  const { app, auth, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8897,
      publicBaseUrl: "http://127.0.0.1:8897",
      oauthIssuerUrl: "http://127.0.0.1:8897/oauth",
      traceExportUrl: `http://127.0.0.1:${address.port}/collect`,
      traceExportAuthHeader: "Bearer trace-export-token",
      traceExportBatchSize: 100,
      traceExportIntervalMs: 60000,
    },
  });
  const server = await startHttpServer(app);
  const adminToken = await auth.issueToken({
    clientId: "admin-client",
    clientSecret: "admin-secret",
    grantType: "client_credentials",
    scope: ["catalog:read", "system:read", "system:write"],
  });

  const searchResponse = await fetch("http://127.0.0.1:8897/v1/catalog/search", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${adminToken.access_token}`,
      "x-trace-id": "trace-export-test",
    },
    body: JSON.stringify({ query: "demo", limit: 5 }),
  });
  assert.equal(searchResponse.status, 200);

  const statusBeforeFlush = await fetch("http://127.0.0.1:8897/v1/system/trace-exporter", {
    headers: {
      authorization: `Bearer ${adminToken.access_token}`,
    },
  });
  assert.equal(statusBeforeFlush.status, 200);
  const beforePayload = (await statusBeforeFlush.json()) as {
    exporter: { enabled: boolean; pendingSpans: number };
  };
  assert.equal(beforePayload.exporter.enabled, true);
  assert.ok(beforePayload.exporter.pendingSpans > 0);

  const flushResponse = await fetch("http://127.0.0.1:8897/v1/system/trace-exporter/flush", {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminToken.access_token}`,
    },
  });
  assert.equal(flushResponse.status, 200);
  const flushPayload = (await flushResponse.json()) as {
    exporter: { pendingSpans: number; lastFlushAt?: string };
  };
  assert.equal(flushPayload.exporter.pendingSpans, 0);
  assert.ok(flushPayload.exporter.lastFlushAt);

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0]?.authorization, "Bearer trace-export-token");
  const exportedPayload = deliveries[0]?.payload as {
    spans: Array<{ traceId: string; name: string }>;
  };
  assert.ok(exportedPayload.spans.length > 0);
  assert.equal(
    exportedPayload.spans.some((span) => span.traceId === "trace-export-test" && span.name === "http.request"),
    true,
  );

  await server.close();
  await close();
  await new Promise<void>((resolve, reject) => {
    collector.close((error) => (error ? reject(error) : resolve()));
  });
});
