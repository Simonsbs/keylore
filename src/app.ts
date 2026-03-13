import pino from "pino";

import { SecretAdapterRegistry } from "./adapters/adapter-registry.js";
import { AwsSecretsManagerAdapter } from "./adapters/aws-secrets-manager-adapter.js";
import { ExecFileCommandRunner } from "./adapters/command-runner.js";
import { EnvSecretAdapter } from "./adapters/env-secret-adapter.js";
import { GcpSecretManagerAdapter } from "./adapters/gcp-secret-manager-adapter.js";
import { OnePasswordSecretAdapter } from "./adapters/onepassword-secret-adapter.js";
import { VaultSecretAdapter } from "./adapters/vault-secret-adapter.js";
import { loadConfig, KeyLoreConfig } from "./config.js";
import { PgAccessTokenRepository } from "./repositories/pg-access-token-repository.js";
import { PgApprovalRepository } from "./repositories/pg-approval-repository.js";
import { PgAuditLogService } from "./repositories/pg-audit-log.js";
import { PgAuthClientRepository } from "./repositories/pg-auth-client-repository.js";
import { PgBreakGlassRepository } from "./repositories/pg-break-glass-repository.js";
import { PgCredentialRepository } from "./repositories/pg-credential-repository.js";
import { PgPolicyRepository } from "./repositories/pg-policy-repository.js";
import { ApprovalService } from "./services/approval-service.js";
import { AuthService } from "./services/auth-service.js";
import { BackupService } from "./services/backup-service.js";
import { BreakGlassService } from "./services/break-glass-service.js";
import { BrokerService } from "./services/broker-service.js";
import { validateEgressTarget } from "./services/egress-policy.js";
import { MaintenanceService } from "./services/maintenance-service.js";
import { PolicyEngine } from "./services/policy-engine.js";
import { PgRateLimitService } from "./services/rate-limit-service.js";
import { TelemetryService } from "./services/telemetry.js";
import { bootstrapFromFiles } from "./storage/bootstrap.js";
import { createPostgresDatabase, SqlDatabase } from "./storage/database.js";
import { runMigrations } from "./storage/migrations.js";
import { SandboxRunner } from "./runtime/sandbox-runner.js";

export interface KeyLoreHealth {
  readiness(): Promise<{
    status: "ready";
    environment: string;
    credentialCount: number;
    maintenance: ReturnType<MaintenanceService["status"]>;
  }>;
}

export interface KeyLoreApp {
  config: KeyLoreConfig;
  logger: pino.Logger;
  broker: BrokerService;
  auth: AuthService;
  approvals: ApprovalService;
  breakGlass: BreakGlassService;
  database: SqlDatabase;
  telemetry: TelemetryService;
  rateLimits: PgRateLimitService;
  maintenance: MaintenanceService;
  backup: BackupService;
  health: KeyLoreHealth;
  close(): Promise<void>;
}

export async function createKeyLoreApp(): Promise<KeyLoreApp> {
  const config = loadConfig();
  const logger = pino({ name: config.appName, level: config.logLevel });
  const database = createPostgresDatabase(config);
  const telemetry = new TelemetryService();

  await database.healthcheck();
  await runMigrations(database, config.migrationsDir);

  const credentialRepository = new PgCredentialRepository(database);
  const policyRepository = new PgPolicyRepository(database);
  const authClientRepository = new PgAuthClientRepository(database);
  const audit = new PgAuditLogService(database);
  const accessTokens = new PgAccessTokenRepository(database);
  const approvals = new PgApprovalRepository(database);
  const breakGlassRepository = new PgBreakGlassRepository(database);
  const rateLimits = new PgRateLimitService(
    database,
    config.rateLimitWindowMs,
    config.rateLimitMaxRequests,
    telemetry,
  );
  const commandRunner = new ExecFileCommandRunner();
  const adapterRegistry = new SecretAdapterRegistry(
    [
      new EnvSecretAdapter(),
      new VaultSecretAdapter(config.vaultAddr, config.vaultToken, config.vaultNamespace),
      new OnePasswordSecretAdapter(commandRunner, config.opBinary),
      new AwsSecretsManagerAdapter(commandRunner, config.awsBinary),
      new GcpSecretManagerAdapter(commandRunner, config.gcloudBinary),
    ],
    config,
    telemetry,
  );
  await credentialRepository.ensureInitialized();
  await policyRepository.ensureInitialized();
  await authClientRepository.ensureInitialized();

  const authService = new AuthService(
    authClientRepository,
    accessTokens,
    audit,
    config.oauthIssuerUrl,
    config.publicBaseUrl,
    config.accessTokenTtlSeconds,
    telemetry,
  );
  const approvalService = new ApprovalService(approvals, audit, config.approvalTtlSeconds);
  const breakGlassService = new BreakGlassService(
    breakGlassRepository,
    audit,
    config.breakGlassMaxDurationSeconds,
  );

  if (config.bootstrapFromFiles) {
    await bootstrapFromFiles(
      credentialRepository,
      policyRepository,
      authClientRepository,
      config.bootstrapCatalogPath,
      config.bootstrapPolicyPath,
      config.bootstrapAuthClientsPath,
    );
  }

  const broker = new BrokerService(
    credentialRepository,
    policyRepository,
    audit,
    adapterRegistry,
    new PolicyEngine(),
    approvalService,
    breakGlassService,
    new SandboxRunner(config),
    validateEgressTarget,
    config,
  );
  const maintenance = new MaintenanceService(
    config.maintenanceEnabled,
    config.maintenanceIntervalMs,
    approvals,
    breakGlassRepository,
    accessTokens,
    rateLimits,
    telemetry,
  );
  maintenance.start();
  const backup = new BackupService(database, config.version, audit);

  return {
    config,
    logger,
    broker,
    auth: authService,
    approvals: approvalService,
    breakGlass: breakGlassService,
    database,
    telemetry,
    rateLimits,
    maintenance,
    backup,
    health: {
      readiness: async () => {
        await database.healthcheck();
        const credentialCount = await broker.countCredentials();

        return {
          status: "ready",
          environment: config.environment,
          credentialCount,
          maintenance: maintenance.status(),
        };
      },
    },
    close: async () => {
      await maintenance.stop();
      await database.close();
    },
  };
}
