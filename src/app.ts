import pino from "pino";

import { EnvSecretAdapter } from "./adapters/env-secret-adapter.js";
import { loadConfig, KeyLoreConfig } from "./config.js";
import { PgAuditLogService } from "./repositories/pg-audit-log.js";
import { PgCredentialRepository } from "./repositories/pg-credential-repository.js";
import { PgPolicyRepository } from "./repositories/pg-policy-repository.js";
import { BrokerService } from "./services/broker-service.js";
import { PolicyEngine } from "./services/policy-engine.js";
import { bootstrapFromFiles } from "./storage/bootstrap.js";
import { createPostgresDatabase, SqlDatabase } from "./storage/database.js";
import { runMigrations } from "./storage/migrations.js";

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
  await credentialRepository.ensureInitialized();
  await policyRepository.ensureInitialized();

  if (config.bootstrapFromFiles) {
    await bootstrapFromFiles(
      credentialRepository,
      policyRepository,
      config.bootstrapCatalogPath,
      config.bootstrapPolicyPath,
    );
  }

  const broker = new BrokerService(
    credentialRepository,
    policyRepository,
    new PgAuditLogService(database),
    new EnvSecretAdapter(),
    new PolicyEngine(),
    config,
  );

  return {
    config,
    logger,
    broker,
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
