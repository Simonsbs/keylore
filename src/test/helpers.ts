import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import pino from "pino";

import { KeyLoreApp } from "../app.js";
import { KeyLoreConfig } from "../config.js";
import { CatalogFile, PolicyFile } from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { PgCredentialRepository } from "../repositories/pg-credential-repository.js";
import { PgPolicyRepository } from "../repositories/pg-policy-repository.js";
import { BrokerService } from "../services/broker-service.js";
import { PolicyEngine } from "../services/policy-engine.js";
import { createInMemoryDatabase } from "../storage/in-memory-database.js";
import { runMigrations } from "../storage/migrations.js";
import { EnvSecretAdapter } from "../adapters/env-secret-adapter.js";

export async function makeTestApp(options?: {
  catalog?: CatalogFile;
  policies?: PolicyFile;
  configOverrides?: Partial<KeyLoreConfig>;
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "keylore-test-"));
  const defaultCatalog: CatalogFile = {
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
        expiresAt: null,
        rotationPolicy: "90 days",
        lastValidatedAt: null,
        selectionNotes: "Demo credential",
        binding: {
          adapter: "env",
          ref: "KEYLORE_TEST_SECRET",
          authType: "bearer",
          headerName: "Authorization",
          headerPrefix: "Bearer ",
        },
        tags: ["demo"],
        status: "active",
      },
    ],
  };

  const defaultPolicies: PolicyFile = {
    version: 1,
    rules: [
      {
        id: "allow-demo",
        effect: "allow",
        description: "Allow local reads",
        principals: ["local-operator"],
        credentialIds: ["demo"],
        operations: ["http.get"],
        domainPatterns: ["localhost"],
        environments: ["test"],
      },
    ],
  };

  const database = createInMemoryDatabase();
  await runMigrations(database, "/home/simon/keylore/migrations");

  const config: KeyLoreConfig = {
    appName: "keylore",
    version: "0.2.0",
    dataDir: tempDir,
    bootstrapCatalogPath: path.join(tempDir, "catalog.json"),
    bootstrapPolicyPath: path.join(tempDir, "policies.json"),
    migrationsDir: "/home/simon/keylore/migrations",
    databaseUrl: "postgres://memory/keylore",
    databasePoolMax: 4,
    httpHost: "127.0.0.1",
    httpPort: 8787,
    environment: "test",
    defaultPrincipal: "local-operator",
    mcpBearerToken: undefined,
    logLevel: "silent",
    bootstrapFromFiles: false,
    maxRequestBytes: 4096,
    outboundTimeoutMs: 1000,
    maxResponseBytes: 2048,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    ...options?.configOverrides,
  };

  const credentialRepository = new PgCredentialRepository(database);
  const policyRepository = new PgPolicyRepository(database);
  const audit = new PgAuditLogService(database);

  const catalog = options?.catalog ?? defaultCatalog;
  for (const credential of catalog.credentials) {
    await credentialRepository.create(credential);
  }

  await policyRepository.replaceAll(options?.policies ?? defaultPolicies);

  const broker = new BrokerService(
    credentialRepository,
    policyRepository,
    audit,
    new EnvSecretAdapter(),
    new PolicyEngine(),
    config,
  );

  const app: KeyLoreApp = {
    config,
    logger: pino({ enabled: false }),
    broker,
    database,
    health: {
      readiness: async () => {
        await database.healthcheck();
        return {
          status: "ready",
          environment: config.environment,
          credentialCount: await broker.countCredentials(),
        };
      },
    },
  };

  return {
    app,
    broker,
    tempDir,
    close: async () => {
      await database.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}
