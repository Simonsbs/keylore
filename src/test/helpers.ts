import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import pino from "pino";

import { KeyLoreApp } from "../app.js";
import { SecretAdapterRegistry } from "../adapters/adapter-registry.js";
import { KeyLoreConfig } from "../config.js";
import { AuthClientRecord, CatalogFile, PolicyFile } from "../domain/types.js";
import { EnvSecretAdapter } from "../adapters/env-secret-adapter.js";
import { PgAccessTokenRepository } from "../repositories/pg-access-token-repository.js";
import { PgApprovalRepository } from "../repositories/pg-approval-repository.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { PgAuthClientRepository } from "../repositories/pg-auth-client-repository.js";
import { PgCredentialRepository } from "../repositories/pg-credential-repository.js";
import { PgPolicyRepository } from "../repositories/pg-policy-repository.js";
import { ApprovalService } from "../services/approval-service.js";
import { AuthService } from "../services/auth-service.js";
import { hashSecret } from "../services/auth-secrets.js";
import { BrokerService } from "../services/broker-service.js";
import { PolicyEngine } from "../services/policy-engine.js";
import { SandboxRunner } from "../runtime/sandbox-runner.js";
import { createInMemoryDatabase } from "../storage/in-memory-database.js";
import { runMigrations } from "../storage/migrations.js";

export async function makeTestApp(options?: {
  catalog?: CatalogFile;
  policies?: PolicyFile;
  authClients?: Array<AuthClientRecord & { clientSecret: string }>;
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
    version: "0.4.0",
    dataDir: tempDir,
    bootstrapCatalogPath: path.join(tempDir, "catalog.json"),
    bootstrapPolicyPath: path.join(tempDir, "policies.json"),
    bootstrapAuthClientsPath: path.join(tempDir, "auth-clients.json"),
    migrationsDir: "/home/simon/keylore/migrations",
    databaseUrl: "postgres://memory/keylore",
    databasePoolMax: 4,
    httpHost: "127.0.0.1",
    httpPort: 8787,
    publicBaseUrl: "http://127.0.0.1:8787",
    oauthIssuerUrl: "http://127.0.0.1:8787/oauth",
    environment: "test",
    defaultPrincipal: "local-operator",
    logLevel: "silent",
    bootstrapFromFiles: false,
    maxRequestBytes: 4096,
    outboundTimeoutMs: 1000,
    maxResponseBytes: 2048,
    rateLimitWindowMs: 60000,
    rateLimitMaxRequests: 120,
    accessTokenTtlSeconds: 3600,
    approvalTtlSeconds: 1800,
    vaultAddr: undefined,
    vaultToken: undefined,
    vaultNamespace: undefined,
    opBinary: "op",
    awsBinary: "aws",
    gcloudBinary: "gcloud",
    sandboxInjectionEnabled: true,
    sandboxCommandAllowlist: [process.execPath],
    sandboxDefaultTimeoutMs: 1000,
    sandboxMaxOutputBytes: 2048,
    ...options?.configOverrides,
  };

  const credentialRepository = new PgCredentialRepository(database);
  const policyRepository = new PgPolicyRepository(database);
  const authClientRepository = new PgAuthClientRepository(database);
  const audit = new PgAuditLogService(database);
  const accessTokens = new PgAccessTokenRepository(database);
  const approvalRepository = new PgApprovalRepository(database);

  const catalog = options?.catalog ?? defaultCatalog;
  for (const credential of catalog.credentials) {
    await credentialRepository.create(credential);
  }

  await policyRepository.replaceAll(options?.policies ?? defaultPolicies);

  const authClients =
    options?.authClients ??
    [
      {
        clientId: "admin-client",
        displayName: "Admin Client",
        roles: ["admin", "operator", "auditor", "approver"],
        allowedScopes: [
          "catalog:read",
          "catalog:write",
          "admin:read",
          "admin:write",
          "broker:use",
          "sandbox:run",
          "audit:read",
          "approval:read",
          "approval:review",
          "mcp:use",
        ],
        status: "active" as const,
        clientSecret: "admin-secret",
      },
      {
        clientId: "consumer-client",
        displayName: "Consumer Client",
        roles: ["consumer"],
        allowedScopes: ["catalog:read", "broker:use", "mcp:use"],
        status: "active" as const,
        clientSecret: "consumer-secret",
      },
    ];

  for (const client of authClients) {
    const hashed = hashSecret(client.clientSecret);
    await authClientRepository.upsert({
      clientId: client.clientId,
      displayName: client.displayName,
      secretHash: hashed.hash,
      secretSalt: hashed.salt,
      roles: client.roles,
      allowedScopes: client.allowedScopes,
      status: client.status,
    });
  }

  const auth = new AuthService(
    authClientRepository,
    accessTokens,
    audit,
    config.oauthIssuerUrl,
    config.publicBaseUrl,
    config.accessTokenTtlSeconds,
  );
  const approvals = new ApprovalService(approvalRepository, audit, config.approvalTtlSeconds);

  const broker = new BrokerService(
    credentialRepository,
    policyRepository,
    audit,
    new SecretAdapterRegistry([new EnvSecretAdapter()]),
    new PolicyEngine(),
    approvals,
    new SandboxRunner(config),
    config,
  );

  const app: KeyLoreApp = {
    config,
    logger: pino({ enabled: false }),
    broker,
    auth,
    approvals,
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
    auth,
    tempDir,
    close: async () => {
      await database.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}
