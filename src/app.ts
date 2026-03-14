import pino from "pino";

import { SecretAdapterRegistry } from "./adapters/adapter-registry.js";
import { AwsSecretsManagerAdapter } from "./adapters/aws-secrets-manager-adapter.js";
import { ExecFileCommandRunner } from "./adapters/command-runner.js";
import { EnvSecretAdapter } from "./adapters/env-secret-adapter.js";
import { LocalSecretAdapter } from "./adapters/local-secret-adapter.js";
import { GcpSecretManagerAdapter } from "./adapters/gcp-secret-manager-adapter.js";
import { OnePasswordSecretAdapter } from "./adapters/onepassword-secret-adapter.js";
import { VaultSecretAdapter } from "./adapters/vault-secret-adapter.js";
import { loadConfig, KeyLoreConfig } from "./config.js";
import { PgAccessTokenRepository } from "./repositories/pg-access-token-repository.js";
import { PgAuthorizationCodeRepository } from "./repositories/pg-authorization-code-repository.js";
import { PgApprovalRepository } from "./repositories/pg-approval-repository.js";
import { PgAuditLogService } from "./repositories/pg-audit-log.js";
import { PgAuthClientRepository } from "./repositories/pg-auth-client-repository.js";
import { PgBreakGlassRepository } from "./repositories/pg-break-glass-repository.js";
import { PgCredentialRepository } from "./repositories/pg-credential-repository.js";
import { PgOAuthClientAssertionRepository } from "./repositories/pg-oauth-client-assertion-repository.js";
import { PgPolicyRepository } from "./repositories/pg-policy-repository.js";
import { PgRefreshTokenRepository } from "./repositories/pg-refresh-token-repository.js";
import { PgRotationRunRepository } from "./repositories/pg-rotation-run-repository.js";
import { PgTenantRepository } from "./repositories/pg-tenant-repository.js";
import { ApprovalService } from "./services/approval-service.js";
import { AuthService } from "./services/auth-service.js";
import { BackupService } from "./services/backup-service.js";
import { BreakGlassService } from "./services/break-glass-service.js";
import { BrokerService } from "./services/broker-service.js";
import { CoreModeService } from "./services/core-mode-service.js";
import { validateEgressTarget } from "./services/egress-policy.js";
import { LocalSecretStore } from "./services/local-secret-store.js";
import { MaintenanceService } from "./services/maintenance-service.js";
import { NotificationService } from "./services/notification-service.js";
import { PolicyEngine } from "./services/policy-engine.js";
import { PgRateLimitService } from "./services/rate-limit-service.js";
import { RotationService } from "./services/rotation-service.js";
import { TelemetryService } from "./services/telemetry.js";
import { TenantService } from "./services/tenant-service.js";
import { TraceExportService } from "./services/trace-export-service.js";
import { TraceService } from "./services/trace-service.js";
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
  tenants: TenantService;
  rotations: RotationService;
  approvals: ApprovalService;
  breakGlass: BreakGlassService;
  coreMode: CoreModeService;
  database: SqlDatabase;
  telemetry: TelemetryService;
  traces: TraceService;
  traceExports: TraceExportService;
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

  await database.healthcheck();
  await runMigrations(database, config.migrationsDir);

  const credentialRepository = new PgCredentialRepository(database);
  const policyRepository = new PgPolicyRepository(database);
  const authClientRepository = new PgAuthClientRepository(database);
  const tenantRepository = new PgTenantRepository(database);
  const assertionRepository = new PgOAuthClientAssertionRepository(database);
  const audit = new PgAuditLogService(database);
  const accessTokens = new PgAccessTokenRepository(database);
  const refreshTokens = new PgRefreshTokenRepository(database);
  const authorizationCodes = new PgAuthorizationCodeRepository(database);
  const approvals = new PgApprovalRepository(database);
  const breakGlassRepository = new PgBreakGlassRepository(database);
  const rotationRuns = new PgRotationRunRepository(database);
  const notificationService = new NotificationService(
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
  const localSecrets = new LocalSecretStore(config.localSecretsFilePath, config.localSecretsKeyPath);
  const commandRunner = new ExecFileCommandRunner();
  const adapterRegistry = new SecretAdapterRegistry(
    [
      new LocalSecretAdapter(localSecrets),
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
  await tenantRepository.ensureInitialized();

  const authService = new AuthService(
    authClientRepository,
    accessTokens,
    refreshTokens,
    authorizationCodes,
    assertionRepository,
    tenantRepository,
    audit,
    config.oauthIssuerUrl,
    config.publicBaseUrl,
    config.accessTokenTtlSeconds,
    config.authorizationCodeTtlSeconds,
    config.refreshTokenTtlSeconds,
    telemetry,
  );
  const tenantService = new TenantService(tenantRepository, database, audit, authService);
  const approvalService = new ApprovalService(
    approvals,
    audit,
    config.approvalTtlSeconds,
    config.approvalReviewQuorum,
    notificationService,
    traces,
  );
  const breakGlassService = new BreakGlassService(
    breakGlassRepository,
    audit,
    config.breakGlassMaxDurationSeconds,
    config.breakGlassReviewQuorum,
    notificationService,
    traces,
  );
  const rotationService = new RotationService(
    rotationRuns,
    credentialRepository,
    adapterRegistry,
    audit,
    notificationService,
    traces,
    config.rotationPlanningHorizonDays,
  );

  if (config.bootstrapFromFiles) {
    await bootstrapFromFiles(
      credentialRepository,
      policyRepository,
      authClientRepository,
      tenantRepository,
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
    tenantRepository,
    new SandboxRunner(config),
    validateEgressTarget,
    config,
  );
  const coreMode = new CoreModeService(broker, policyRepository, localSecrets, config.defaultPrincipal);
  const maintenance = new MaintenanceService(
    config.maintenanceEnabled,
    config.maintenanceIntervalMs,
    approvals,
    breakGlassRepository,
    accessTokens,
    refreshTokens,
    rateLimits,
    authorizationCodes,
    assertionRepository,
    telemetry,
  );
  traceExports.start();
  maintenance.start();
  const backup = new BackupService(database, config.version, audit);

  return {
    config,
    logger,
    broker,
    auth: authService,
    tenants: tenantService,
    rotations: rotationService,
    approvals: approvalService,
    breakGlass: breakGlassService,
    coreMode,
    database,
    telemetry,
    traces,
    traceExports,
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
      await traceExports.stop();
      await maintenance.stop();
      await database.close();
    },
  };
}
