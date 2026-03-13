import path from "node:path";

import * as z from "zod/v4";

export interface KeyLoreConfig {
  appName: string;
  version: string;
  dataDir: string;
  bootstrapCatalogPath: string;
  bootstrapPolicyPath: string;
  bootstrapAuthClientsPath: string;
  migrationsDir: string;
  databaseUrl: string;
  databasePoolMax: number;
  httpHost: string;
  httpPort: number;
  publicBaseUrl: string;
  oauthIssuerUrl: string;
  environment: string;
  defaultPrincipal: string;
  logLevel: string;
  bootstrapFromFiles: boolean;
  maxRequestBytes: number;
  outboundTimeoutMs: number;
  maxResponseBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  maintenanceEnabled: boolean;
  maintenanceIntervalMs: number;
  accessTokenTtlSeconds: number;
  approvalTtlSeconds: number;
  vaultAddr: string | undefined;
  vaultToken: string | undefined;
  vaultNamespace: string | undefined;
  opBinary: string;
  awsBinary: string;
  gcloudBinary: string;
  sandboxInjectionEnabled: boolean;
  sandboxCommandAllowlist: string[];
  sandboxDefaultTimeoutMs: number;
  sandboxMaxOutputBytes: number;
  adapterMaxAttempts: number;
  adapterRetryDelayMs: number;
  adapterCircuitBreakerThreshold: number;
  adapterCircuitBreakerCooldownMs: number;
}

const envSchema = z.object({
  KEYLORE_DATA_DIR: z.string().optional(),
  KEYLORE_CATALOG_FILE: z.string().optional(),
  KEYLORE_POLICY_FILE: z.string().optional(),
  KEYLORE_AUTH_CLIENTS_FILE: z.string().optional(),
  KEYLORE_MIGRATIONS_DIR: z.string().optional(),
  KEYLORE_DATABASE_URL: z.string().min(1),
  KEYLORE_DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  KEYLORE_HTTP_HOST: z.string().default("127.0.0.1"),
  KEYLORE_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  KEYLORE_PUBLIC_BASE_URL: z.string().url().optional(),
  KEYLORE_OAUTH_ISSUER_URL: z.string().url().optional(),
  KEYLORE_ENVIRONMENT: z.string().default("development"),
  KEYLORE_DEFAULT_PRINCIPAL: z.string().default("local-operator"),
  KEYLORE_LOG_LEVEL: z.string().default("info"),
  KEYLORE_BOOTSTRAP_FROM_FILES: z
    .string()
    .transform((value) => value !== "false")
    .prefault("true"),
  KEYLORE_MAX_REQUEST_BYTES: z.coerce.number().int().min(1024).default(131072),
  KEYLORE_OUTBOUND_TIMEOUT_MS: z.coerce.number().int().min(100).default(10000),
  KEYLORE_MAX_RESPONSE_BYTES: z.coerce.number().int().min(1024).default(32768),
  KEYLORE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(60000),
  KEYLORE_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).default(120),
  KEYLORE_MAINTENANCE_ENABLED: z
    .string()
    .transform((value) => value !== "false")
    .prefault("true"),
  KEYLORE_MAINTENANCE_INTERVAL_MS: z.coerce.number().int().min(1000).default(60000),
  KEYLORE_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
  KEYLORE_APPROVAL_TTL_SECONDS: z.coerce.number().int().min(60).default(1800),
  KEYLORE_VAULT_ADDR: z.string().url().optional(),
  KEYLORE_VAULT_TOKEN: z.string().optional(),
  KEYLORE_VAULT_NAMESPACE: z.string().optional(),
  KEYLORE_OP_BIN: z.string().default("op"),
  KEYLORE_AWS_BIN: z.string().default("aws"),
  KEYLORE_GCLOUD_BIN: z.string().default("gcloud"),
  KEYLORE_SANDBOX_INJECTION_ENABLED: z
    .string()
    .transform((value) => value === "true")
    .prefault("false"),
  KEYLORE_SANDBOX_COMMAND_ALLOWLIST: z.string().default(""),
  KEYLORE_SANDBOX_DEFAULT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  KEYLORE_SANDBOX_MAX_OUTPUT_BYTES: z.coerce.number().int().min(256).default(16384),
  KEYLORE_ADAPTER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  KEYLORE_ADAPTER_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(250),
  KEYLORE_ADAPTER_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(3),
  KEYLORE_ADAPTER_CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().min(1000).default(60000),
});

export function loadConfig(cwd = process.cwd()): KeyLoreConfig {
  const env = envSchema.parse(process.env);
  const dataDir = path.resolve(cwd, env.KEYLORE_DATA_DIR ?? "data");
  const publicBaseUrl =
    env.KEYLORE_PUBLIC_BASE_URL ?? `http://${env.KEYLORE_HTTP_HOST}:${env.KEYLORE_HTTP_PORT}`;
  const oauthIssuerUrl = env.KEYLORE_OAUTH_ISSUER_URL ?? `${publicBaseUrl}/oauth`;

  return {
    appName: "keylore",
    version: "0.5.0",
    dataDir,
    bootstrapCatalogPath: path.resolve(dataDir, env.KEYLORE_CATALOG_FILE ?? "catalog.json"),
    bootstrapPolicyPath: path.resolve(dataDir, env.KEYLORE_POLICY_FILE ?? "policies.json"),
    bootstrapAuthClientsPath: path.resolve(
      dataDir,
      env.KEYLORE_AUTH_CLIENTS_FILE ?? "auth-clients.json",
    ),
    migrationsDir: path.resolve(cwd, env.KEYLORE_MIGRATIONS_DIR ?? "migrations"),
    databaseUrl: env.KEYLORE_DATABASE_URL,
    databasePoolMax: env.KEYLORE_DATABASE_POOL_MAX,
    httpHost: env.KEYLORE_HTTP_HOST,
    httpPort: env.KEYLORE_HTTP_PORT,
    publicBaseUrl,
    oauthIssuerUrl,
    environment: env.KEYLORE_ENVIRONMENT,
    defaultPrincipal: env.KEYLORE_DEFAULT_PRINCIPAL,
    logLevel: env.KEYLORE_LOG_LEVEL,
    bootstrapFromFiles: env.KEYLORE_BOOTSTRAP_FROM_FILES,
    maxRequestBytes: env.KEYLORE_MAX_REQUEST_BYTES,
    outboundTimeoutMs: env.KEYLORE_OUTBOUND_TIMEOUT_MS,
    maxResponseBytes: env.KEYLORE_MAX_RESPONSE_BYTES,
    rateLimitWindowMs: env.KEYLORE_RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: env.KEYLORE_RATE_LIMIT_MAX_REQUESTS,
    maintenanceEnabled: env.KEYLORE_MAINTENANCE_ENABLED,
    maintenanceIntervalMs: env.KEYLORE_MAINTENANCE_INTERVAL_MS,
    accessTokenTtlSeconds: env.KEYLORE_ACCESS_TOKEN_TTL_SECONDS,
    approvalTtlSeconds: env.KEYLORE_APPROVAL_TTL_SECONDS,
    vaultAddr: env.KEYLORE_VAULT_ADDR || undefined,
    vaultToken: env.KEYLORE_VAULT_TOKEN || undefined,
    vaultNamespace: env.KEYLORE_VAULT_NAMESPACE || undefined,
    opBinary: env.KEYLORE_OP_BIN,
    awsBinary: env.KEYLORE_AWS_BIN,
    gcloudBinary: env.KEYLORE_GCLOUD_BIN,
    sandboxInjectionEnabled: env.KEYLORE_SANDBOX_INJECTION_ENABLED,
    sandboxCommandAllowlist: env.KEYLORE_SANDBOX_COMMAND_ALLOWLIST
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    sandboxDefaultTimeoutMs: env.KEYLORE_SANDBOX_DEFAULT_TIMEOUT_MS,
    sandboxMaxOutputBytes: env.KEYLORE_SANDBOX_MAX_OUTPUT_BYTES,
    adapterMaxAttempts: env.KEYLORE_ADAPTER_MAX_ATTEMPTS,
    adapterRetryDelayMs: env.KEYLORE_ADAPTER_RETRY_DELAY_MS,
    adapterCircuitBreakerThreshold: env.KEYLORE_ADAPTER_CIRCUIT_BREAKER_THRESHOLD,
    adapterCircuitBreakerCooldownMs: env.KEYLORE_ADAPTER_CIRCUIT_BREAKER_COOLDOWN_MS,
  };
}
