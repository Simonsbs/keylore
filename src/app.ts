import pino from "pino";

import { EnvSecretAdapter } from "./adapters/env-secret-adapter.js";
import { loadConfig, KeyLoreConfig } from "./config.js";
import { JsonCredentialRepository } from "./repositories/credential-repository.js";
import { JsonPolicyRepository } from "./repositories/policy-repository.js";
import { AuditLogService } from "./services/audit-log.js";
import { BrokerService } from "./services/broker-service.js";
import { PolicyEngine } from "./services/policy-engine.js";

export interface KeyLoreApp {
  config: KeyLoreConfig;
  logger: pino.Logger;
  broker: BrokerService;
}

export async function createKeyLoreApp(): Promise<KeyLoreApp> {
  const config = loadConfig();
  const logger = pino({ name: config.appName, level: config.logLevel });

  const credentialRepository = new JsonCredentialRepository(config.catalogPath);
  const policyRepository = new JsonPolicyRepository(config.policyPath);
  await credentialRepository.ensureInitialized();
  await policyRepository.ensureInitialized();

  const broker = new BrokerService(
    credentialRepository,
    policyRepository,
    new AuditLogService(config.auditPath),
    new EnvSecretAdapter(),
    new PolicyEngine(),
    config,
  );

  return {
    config,
    logger,
    broker,
  };
}
