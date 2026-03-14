import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
import { PgBreakGlassRepository } from "../repositories/pg-break-glass-repository.js";
import { PgCredentialRepository } from "../repositories/pg-credential-repository.js";
import { PgOAuthClientAssertionRepository } from "../repositories/pg-oauth-client-assertion-repository.js";
import { PgPolicyRepository } from "../repositories/pg-policy-repository.js";
import { PgRotationRunRepository } from "../repositories/pg-rotation-run-repository.js";
import { ApprovalService } from "../services/approval-service.js";
import { AuthService } from "../services/auth-service.js";
import { BackupService } from "../services/backup-service.js";
import { BreakGlassService } from "../services/break-glass-service.js";
import { hashSecret } from "../services/auth-secrets.js";
import { BrokerService } from "../services/broker-service.js";
import { validateEgressTarget } from "../services/egress-policy.js";
import { MaintenanceService } from "../services/maintenance-service.js";
import { NotificationService } from "../services/notification-service.js";
import { PolicyEngine } from "../services/policy-engine.js";
import { PgRateLimitService } from "../services/rate-limit-service.js";
import { RotationService } from "../services/rotation-service.js";
import { TelemetryService } from "../services/telemetry.js";
import { TraceExportService } from "../services/trace-export-service.js";
import { TraceService } from "../services/trace-service.js";
import { SandboxRunner } from "../runtime/sandbox-runner.js";
import { createInMemoryDatabase } from "../storage/in-memory-database.js";
import { SqlDatabase } from "../storage/database.js";
import { runMigrations } from "../storage/migrations.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../..");
const migrationsDir = path.join(repoRoot, "migrations");

export async function makeTestApp(options?: {
  catalog?: CatalogFile;
  policies?: PolicyFile;
  authClients?: Array<
    Omit<AuthClientRecord, "tokenEndpointAuthMethod" | "jwks" | "tenantId"> &
      Partial<Pick<AuthClientRecord, "tokenEndpointAuthMethod" | "jwks" | "tenantId">> & {
        clientSecret?: string;
      }
  >;
  configOverrides?: Partial<KeyLoreConfig>;
  database?: SqlDatabase;
  skipMigrations?: boolean;
}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "keylore-test-"));
  const defaultCatalog: CatalogFile = {
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
        tenantId: "default",
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

  const database = options?.database ?? createInMemoryDatabase();
  const ownsDatabase = !options?.database;
  if (!options?.skipMigrations) {
    await runMigrations(database, migrationsDir);
  }

  const config: KeyLoreConfig = {
    appName: "keylore",
    version: "0.10.0",
    dataDir: tempDir,
    bootstrapCatalogPath: path.join(tempDir, "catalog.json"),
    bootstrapPolicyPath: path.join(tempDir, "policies.json"),
    bootstrapAuthClientsPath: path.join(tempDir, "auth-clients.json"),
    migrationsDir,
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
    maintenanceEnabled: false,
    maintenanceIntervalMs: 60000,
    accessTokenTtlSeconds: 3600,
    approvalTtlSeconds: 1800,
    approvalReviewQuorum: 1,
    breakGlassMaxDurationSeconds: 900,
    breakGlassReviewQuorum: 1,
    vaultAddr: undefined,
    vaultToken: undefined,
    vaultNamespace: undefined,
    opBinary: "op",
    awsBinary: "aws",
    gcloudBinary: "gcloud",
    egressAllowPrivateIps: false,
    egressAllowedHosts: [],
    egressAllowedHttpsPorts: [443],
    sandboxInjectionEnabled: true,
    sandboxCommandAllowlist: [process.execPath],
    sandboxEnvAllowlist: [],
    sandboxDefaultTimeoutMs: 1000,
    sandboxMaxOutputBytes: 2048,
    adapterMaxAttempts: 2,
    adapterRetryDelayMs: 1,
    adapterCircuitBreakerThreshold: 2,
    adapterCircuitBreakerCooldownMs: 1000,
    notificationWebhookUrl: undefined,
    notificationSigningSecret: undefined,
    notificationTimeoutMs: 1000,
    traceCaptureEnabled: true,
    traceRecentSpanLimit: 200,
    traceExportUrl: undefined,
    traceExportAuthHeader: undefined,
    traceExportBatchSize: 20,
    traceExportIntervalMs: 1000,
    traceExportTimeoutMs: 1000,
    rotationPlanningHorizonDays: 14,
    ...options?.configOverrides,
  };

  const credentialRepository = new PgCredentialRepository(database);
  const policyRepository = new PgPolicyRepository(database);
  const authClientRepository = new PgAuthClientRepository(database);
  const assertionRepository = new PgOAuthClientAssertionRepository(database);
  const audit = new PgAuditLogService(database);
  const accessTokens = new PgAccessTokenRepository(database);
  const approvalRepository = new PgApprovalRepository(database);
  const breakGlassRepository = new PgBreakGlassRepository(database);
  const rotationRepository = new PgRotationRunRepository(database);
  const telemetry = new TelemetryService();
  const traces = new TraceService(config.traceCaptureEnabled, config.traceRecentSpanLimit);
  const traceExports = new TraceExportService(
    config.traceExportUrl,
    config.traceExportAuthHeader,
    config.traceExportBatchSize,
    config.traceExportIntervalMs,
    config.traceExportTimeoutMs,
    telemetry,
  );
  traces.attachExporter(traceExports);
  const notifications = new NotificationService(
    config.notificationWebhookUrl,
    config.notificationSigningSecret,
    config.notificationTimeoutMs,
    audit,
    telemetry,
    traces,
  );
  const rateLimits = new PgRateLimitService(
    database,
    config.rateLimitWindowMs,
    config.rateLimitMaxRequests,
    telemetry,
  );

  const catalog = options?.catalog ?? defaultCatalog;
  for (const credential of catalog.credentials) {
    const existing = await credentialRepository.getById(credential.id);
    if (!existing) {
      await credentialRepository.create(credential);
    }
  }

  await policyRepository.replaceAll(options?.policies ?? defaultPolicies);

  const authClients =
    options?.authClients ??
    [
      {
        clientId: "admin-client",
        displayName: "Admin Client",
        roles: [
          "admin",
          "auth_admin",
          "operator",
          "maintenance_operator",
          "backup_operator",
          "breakglass_operator",
          "auditor",
          "approver",
        ],
        allowedScopes: [
          "catalog:read",
          "catalog:write",
          "admin:read",
          "admin:write",
          "auth:read",
          "auth:write",
          "broker:use",
          "sandbox:run",
          "audit:read",
          "approval:read",
          "approval:review",
          "system:read",
          "system:write",
          "backup:read",
          "backup:write",
          "breakglass:request",
          "breakglass:read",
          "breakglass:review",
          "mcp:use",
        ],
        status: "active" as const,
        clientSecret: "admin-secret",
        tokenEndpointAuthMethod: "client_secret_basic" as const,
        jwks: [],
      },
      {
        clientId: "consumer-client",
        displayName: "Consumer Client",
        roles: ["consumer"],
        allowedScopes: ["catalog:read", "broker:use", "mcp:use"],
        status: "active" as const,
        clientSecret: "consumer-secret",
        tokenEndpointAuthMethod: "client_secret_basic" as const,
        jwks: [],
      },
    ];

  for (const client of authClients.map((client) => ({
    tenantId: "default",
    tokenEndpointAuthMethod: "client_secret_basic" as const,
    jwks: [],
    ...client,
  }))) {
    const hashed = client.clientSecret ? hashSecret(client.clientSecret) : undefined;
    await authClientRepository.upsert({
      clientId: client.clientId,
      tenantId: client.tenantId,
      displayName: client.displayName,
      secretHash: hashed?.hash,
      secretSalt: hashed?.salt,
      roles: client.roles,
      allowedScopes: client.allowedScopes,
      status: client.status,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      jwks: client.jwks,
    });
  }

  const auth = new AuthService(
    authClientRepository,
    accessTokens,
    assertionRepository,
    audit,
    config.oauthIssuerUrl,
    config.publicBaseUrl,
    config.accessTokenTtlSeconds,
    telemetry,
  );
  const approvals = new ApprovalService(
    approvalRepository,
    audit,
    config.approvalTtlSeconds,
    config.approvalReviewQuorum,
    notifications,
    traces,
  );
  const breakGlass = new BreakGlassService(
    breakGlassRepository,
    audit,
    config.breakGlassMaxDurationSeconds,
    config.breakGlassReviewQuorum,
    notifications,
    traces,
  );
  const rotations = new RotationService(
    rotationRepository,
    credentialRepository,
    new SecretAdapterRegistry([new EnvSecretAdapter()], config, telemetry),
    audit,
    notifications,
    traces,
    config.rotationPlanningHorizonDays,
  );
  const maintenance = new MaintenanceService(
    config.maintenanceEnabled,
    config.maintenanceIntervalMs,
    approvalRepository,
    breakGlassRepository,
    accessTokens,
    rateLimits,
    assertionRepository,
    telemetry,
  );
  traceExports.start();

  const broker = new BrokerService(
    credentialRepository,
    policyRepository,
    audit,
    new SecretAdapterRegistry([new EnvSecretAdapter()], config, telemetry),
    new PolicyEngine(),
    approvals,
    breakGlass,
    new SandboxRunner(config),
    validateEgressTarget,
    config,
  );

  const app: KeyLoreApp = {
    config,
    logger: pino({ enabled: false }),
    broker,
    auth,
    rotations,
    approvals,
    breakGlass,
    database,
    telemetry,
    traces,
    traceExports,
    rateLimits,
    maintenance,
    backup: new BackupService(database, config.version, audit),
    health: {
      readiness: async () => {
        await database.healthcheck();
        return {
          status: "ready",
          environment: config.environment,
          credentialCount: await broker.countCredentials(),
          maintenance: maintenance.status(),
        };
      },
    },
    close: async () => {
      await traceExports.stop();
      await maintenance.stop();
      await database.close();
    },
  };

  return {
    app,
    broker,
    auth,
    tempDir,
    close: async () => {
      if (ownsDatabase) {
        await app.close();
      } else {
        await maintenance.stop();
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}
