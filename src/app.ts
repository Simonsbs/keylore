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
import { PgCredentialRepository } from "./repositories/pg-credential-repository.js";
import { PgPolicyRepository } from "./repositories/pg-policy-repository.js";
import { ApprovalService } from "./services/approval-service.js";
import { AuthService } from "./services/auth-service.js";
import { BrokerService } from "./services/broker-service.js";
import { PolicyEngine } from "./services/policy-engine.js";
import { bootstrapFromFiles } from "./storage/bootstrap.js";
import { createPostgresDatabase, SqlDatabase } from "./storage/database.js";
import { runMigrations } from "./storage/migrations.js";
import { SandboxRunner } from "./runtime/sandbox-runner.js";

export interface KeyLoreHealth {
  readiness(): Promise<{
    status: "ready";
    environment: string;
    credentialCount: number;
  }>;
}

export interface KeyLoreApp {
  config: KeyLoreConfig;
  logger: pino.Logger;
  broker: BrokerService;
  auth: AuthService;
  approvals: ApprovalService;
  database: SqlDatabase;
  health: KeyLoreHealth;
}

export async function createKeyLoreApp(): Promise<KeyLoreApp> {
  const config = loadConfig();
  const logger = pino({ name: config.appName, level: config.logLevel });
  const database = createPostgresDatabase(config);

  await database.healthcheck();
  await runMigrations(database, config.migrationsDir);

  const credentialRepository = new PgCredentialRepository(database);
  const policyRepository = new PgPolicyRepository(database);
  const authClientRepository = new PgAuthClientRepository(database);
  const audit = new PgAuditLogService(database);
  const commandRunner = new ExecFileCommandRunner();
  const adapterRegistry = new SecretAdapterRegistry([
    new EnvSecretAdapter(),
    new VaultSecretAdapter(config.vaultAddr, config.vaultToken, config.vaultNamespace),
    new OnePasswordSecretAdapter(commandRunner, config.opBinary),
    new AwsSecretsManagerAdapter(commandRunner, config.awsBinary),
    new GcpSecretManagerAdapter(commandRunner, config.gcloudBinary),
  ]);
  await credentialRepository.ensureInitialized();
  await policyRepository.ensureInitialized();
  await authClientRepository.ensureInitialized();

  const authService = new AuthService(
    authClientRepository,
    new PgAccessTokenRepository(database),
    audit,
    config.oauthIssuerUrl,
    config.publicBaseUrl,
    config.accessTokenTtlSeconds,
  );
  const approvalService = new ApprovalService(
    new PgApprovalRepository(database),
    audit,
    config.approvalTtlSeconds,
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
    new SandboxRunner(config),
    config,
  );

  return {
    config,
    logger,
    broker,
    auth: authService,
    approvals: approvalService,
    database,
    health: {
      readiness: async () => {
        await database.healthcheck();
        const credentialCount = await broker.countCredentials();

        return {
          status: "ready",
          environment: config.environment,
          credentialCount,
        };
      },
    },
  };
}
