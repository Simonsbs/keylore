import fs from "node:fs";
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
  localSecretsFilePath: string;
  localSecretsKeyPath: string;
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
  authorizationCodeTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  approvalTtlSeconds: number;
  approvalReviewQuorum: number;
  breakGlassMaxDurationSeconds: number;
  breakGlassReviewQuorum: number;
  vaultAddr: string | undefined;
  vaultToken: string | undefined;
  vaultNamespace: string | undefined;
  opBinary: string;
  awsBinary: string;
  gcloudBinary: string;
  egressAllowPrivateIps: boolean;
  egressAllowedHosts: string[];
  egressAllowedHttpsPorts: number[];
  sandboxInjectionEnabled: boolean;
  sandboxCommandAllowlist: string[];
  sandboxEnvAllowlist: string[];
  sandboxDefaultTimeoutMs: number;
  sandboxMaxOutputBytes: number;
  adapterMaxAttempts: number;
  adapterRetryDelayMs: number;
  adapterCircuitBreakerThreshold: number;
  adapterCircuitBreakerCooldownMs: number;
  notificationWebhookUrl: string | undefined;
  notificationSigningSecret: string | undefined;
  notificationTimeoutMs: number;
  traceCaptureEnabled: boolean;
  traceRecentSpanLimit: number;
  traceExportUrl: string | undefined;
  traceExportAuthHeader: string | undefined;
  traceExportBatchSize: number;
  traceExportIntervalMs: number;
  traceExportTimeoutMs: number;
  rotationPlanningHorizonDays: number;
  localQuickstartEnabled: boolean;
  localQuickstartBootstrap:
    | {
        clientId: string;
        clientSecret: string;
        scopes: string[];
      }
    | undefined;
  localAdminBootstrap:
    | {
        clientId: string;
        clientSecret: string;
        scopes: string[];
      }
    | undefined;
}

const LOCAL_DATABASE_URL = "postgresql://keylore:keylore@127.0.0.1:5432/keylore";
const LOCAL_ADMIN_CLIENT_ID = "keylore-admin-local";
const LOCAL_ADMIN_CLIENT_SECRET = "keylore-local-admin";
const LOCAL_CONSUMER_CLIENT_SECRET = "keylore-local-consumer";
const LOCAL_ADMIN_SCOPES = [
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
] as const;

const emptyStringToUndefined = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, schema);

const optionalUrl = emptyStringToUndefined(z.string().url().optional());
const optionalString = emptyStringToUndefined(z.string().optional());

function parseDotEnv(contents: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    parsed[key] = value;
  }

  return parsed;
}

function isMissing(value: string | undefined): boolean {
  return value === undefined || value.trim() === "";
}

function isLoopbackHost(host: string | undefined): boolean {
  return host === undefined || host === "127.0.0.1" || host === "localhost" || host === "::1";
}

function hydrateEnvironment(cwd: string): {
  env: NodeJS.ProcessEnv;
  localAdminBootstrapAvailable: boolean;
} {
  const envFilePath = path.resolve(cwd, ".env");
  const fileEnv =
    fs.existsSync(envFilePath) && fs.statSync(envFilePath).isFile()
      ? parseDotEnv(fs.readFileSync(envFilePath, "utf8"))
      : {};

  const effectiveEnv: NodeJS.ProcessEnv = {
    ...fileEnv,
    ...process.env,
  };

  if (isMissing(effectiveEnv.KEYLORE_DATABASE_URL)) {
    effectiveEnv.KEYLORE_DATABASE_URL = LOCAL_DATABASE_URL;
  }

  const environment = effectiveEnv.KEYLORE_ENVIRONMENT?.trim() || "development";
  const httpHost = effectiveEnv.KEYLORE_HTTP_HOST?.trim() || "127.0.0.1";
  const bootstrapFromFiles = effectiveEnv.KEYLORE_BOOTSTRAP_FROM_FILES !== "false";
  const localQuickstartEnabled =
    environment !== "production" && bootstrapFromFiles && isLoopbackHost(httpHost);
  const adminSecretWasMissing = isMissing(effectiveEnv.KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET);
  const consumerSecretWasMissing = isMissing(effectiveEnv.KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET);

  if (localQuickstartEnabled) {
    if (adminSecretWasMissing) {
      effectiveEnv.KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET = LOCAL_ADMIN_CLIENT_SECRET;
    }
    if (consumerSecretWasMissing) {
      effectiveEnv.KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET = LOCAL_CONSUMER_CLIENT_SECRET;
    }
  }

  for (const [key, value] of Object.entries(effectiveEnv)) {
    if (value !== undefined && isMissing(process.env[key])) {
      process.env[key] = value;
    }
  }

  return {
    env: effectiveEnv,
    localAdminBootstrapAvailable: localQuickstartEnabled && adminSecretWasMissing,
  };
}

const envSchema = z.object({
  KEYLORE_DATA_DIR: z.string().optional(),
  KEYLORE_CATALOG_FILE: z.string().optional(),
  KEYLORE_POLICY_FILE: z.string().optional(),
  KEYLORE_AUTH_CLIENTS_FILE: z.string().optional(),
  KEYLORE_MIGRATIONS_DIR: z.string().optional(),
  KEYLORE_LOCAL_SECRETS_FILE: z.string().optional(),
  KEYLORE_LOCAL_SECRETS_KEY_FILE: z.string().optional(),
  KEYLORE_DATABASE_URL: z.string().min(1),
  KEYLORE_DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  KEYLORE_HTTP_HOST: z.string().default("127.0.0.1"),
  KEYLORE_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  KEYLORE_PUBLIC_BASE_URL: z.string().url().optional(),
  KEYLORE_OAUTH_ISSUER_URL: z.string().url().optional(),
  KEYLORE_ENVIRONMENT: z.string().default("development"),
  KEYLORE_DEFAULT_PRINCIPAL: z.string().default("local-operator"),
  KEYLORE_LOG_LEVEL: z.string().default("info"),
  KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET: z.string().optional(),
  KEYLORE_BOOTSTRAP_CONSUMER_CLIENT_SECRET: z.string().optional(),
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
  KEYLORE_AUTHORIZATION_CODE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  KEYLORE_REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).default(2592000),
  KEYLORE_APPROVAL_TTL_SECONDS: z.coerce.number().int().min(60).default(1800),
  KEYLORE_APPROVAL_REVIEW_QUORUM: z.coerce.number().int().min(1).max(5).default(1),
  KEYLORE_BREAKGLASS_MAX_DURATION_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  KEYLORE_BREAKGLASS_REVIEW_QUORUM: z.coerce.number().int().min(1).max(5).default(1),
  KEYLORE_VAULT_ADDR: optionalUrl,
  KEYLORE_VAULT_TOKEN: optionalString,
  KEYLORE_VAULT_NAMESPACE: optionalString,
  KEYLORE_OP_BIN: z.string().default("op"),
  KEYLORE_AWS_BIN: z.string().default("aws"),
  KEYLORE_GCLOUD_BIN: z.string().default("gcloud"),
  KEYLORE_EGRESS_ALLOW_PRIVATE_IPS: z
    .string()
    .transform((value) => value === "true")
    .prefault("false"),
  KEYLORE_EGRESS_ALLOWED_HOSTS: z.string().default(""),
  KEYLORE_EGRESS_ALLOWED_HTTPS_PORTS: z.string().default("443"),
  KEYLORE_SANDBOX_INJECTION_ENABLED: z
    .string()
    .transform((value) => value === "true")
    .prefault("false"),
  KEYLORE_SANDBOX_COMMAND_ALLOWLIST: z.string().default(""),
  KEYLORE_SANDBOX_ENV_ALLOWLIST: z.string().default(""),
  KEYLORE_SANDBOX_DEFAULT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  KEYLORE_SANDBOX_MAX_OUTPUT_BYTES: z.coerce.number().int().min(256).default(16384),
  KEYLORE_ADAPTER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(2),
  KEYLORE_ADAPTER_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(250),
  KEYLORE_ADAPTER_CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().int().min(1).default(3),
  KEYLORE_ADAPTER_CIRCUIT_BREAKER_COOLDOWN_MS: z.coerce.number().int().min(1000).default(60000),
  KEYLORE_NOTIFICATION_WEBHOOK_URL: optionalUrl,
  KEYLORE_NOTIFICATION_SIGNING_SECRET: optionalString,
  KEYLORE_NOTIFICATION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  KEYLORE_TRACE_CAPTURE_ENABLED: z
    .string()
    .transform((value) => value !== "false")
    .prefault("true"),
  KEYLORE_TRACE_RECENT_SPAN_LIMIT: z.coerce.number().int().min(10).max(5000).default(500),
  KEYLORE_TRACE_EXPORT_URL: optionalUrl,
  KEYLORE_TRACE_EXPORT_AUTH_HEADER: optionalString,
  KEYLORE_TRACE_EXPORT_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(50),
  KEYLORE_TRACE_EXPORT_INTERVAL_MS: z.coerce.number().int().min(100).default(5000),
  KEYLORE_TRACE_EXPORT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5000),
  KEYLORE_ROTATION_PLANNING_HORIZON_DAYS: z.coerce.number().int().min(1).max(365).default(14),
});

export function loadConfig(cwd = process.cwd()): KeyLoreConfig {
  const hydrated = hydrateEnvironment(cwd);
  const env = envSchema.parse(hydrated.env);
  const dataDir = path.resolve(cwd, env.KEYLORE_DATA_DIR ?? "data");
  const publicBaseUrl =
    env.KEYLORE_PUBLIC_BASE_URL ?? `http://${env.KEYLORE_HTTP_HOST}:${env.KEYLORE_HTTP_PORT}`;
  const oauthIssuerUrl = env.KEYLORE_OAUTH_ISSUER_URL ?? `${publicBaseUrl}/oauth`;
  const localQuickstartEnabled =
    env.KEYLORE_ENVIRONMENT !== "production" &&
    env.KEYLORE_BOOTSTRAP_FROM_FILES &&
    isLoopbackHost(env.KEYLORE_HTTP_HOST);

  return {
    appName: "keylore",
    version: "1.0.0-rc4",
    dataDir,
    bootstrapCatalogPath: path.resolve(dataDir, env.KEYLORE_CATALOG_FILE ?? "catalog.json"),
    bootstrapPolicyPath: path.resolve(dataDir, env.KEYLORE_POLICY_FILE ?? "policies.json"),
    bootstrapAuthClientsPath: path.resolve(
      dataDir,
      env.KEYLORE_AUTH_CLIENTS_FILE ?? "auth-clients.json",
    ),
    migrationsDir: path.resolve(cwd, env.KEYLORE_MIGRATIONS_DIR ?? "migrations"),
    localSecretsFilePath: path.resolve(dataDir, env.KEYLORE_LOCAL_SECRETS_FILE ?? "local-secrets.enc.json"),
    localSecretsKeyPath: path.resolve(dataDir, env.KEYLORE_LOCAL_SECRETS_KEY_FILE ?? "local-secrets.key"),
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
    authorizationCodeTtlSeconds: env.KEYLORE_AUTHORIZATION_CODE_TTL_SECONDS,
    refreshTokenTtlSeconds: env.KEYLORE_REFRESH_TOKEN_TTL_SECONDS,
    approvalTtlSeconds: env.KEYLORE_APPROVAL_TTL_SECONDS,
    approvalReviewQuorum: env.KEYLORE_APPROVAL_REVIEW_QUORUM,
    breakGlassMaxDurationSeconds: env.KEYLORE_BREAKGLASS_MAX_DURATION_SECONDS,
    breakGlassReviewQuorum: env.KEYLORE_BREAKGLASS_REVIEW_QUORUM,
    vaultAddr: env.KEYLORE_VAULT_ADDR || undefined,
    vaultToken: env.KEYLORE_VAULT_TOKEN || undefined,
    vaultNamespace: env.KEYLORE_VAULT_NAMESPACE || undefined,
    opBinary: env.KEYLORE_OP_BIN,
    awsBinary: env.KEYLORE_AWS_BIN,
    gcloudBinary: env.KEYLORE_GCLOUD_BIN,
    egressAllowPrivateIps: env.KEYLORE_EGRESS_ALLOW_PRIVATE_IPS,
    egressAllowedHosts: env.KEYLORE_EGRESS_ALLOWED_HOSTS
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    egressAllowedHttpsPorts: env.KEYLORE_EGRESS_ALLOWED_HTTPS_PORTS
      .split(",")
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value >= 1 && value <= 65535),
    sandboxInjectionEnabled: env.KEYLORE_SANDBOX_INJECTION_ENABLED,
    sandboxCommandAllowlist: env.KEYLORE_SANDBOX_COMMAND_ALLOWLIST
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    sandboxEnvAllowlist: env.KEYLORE_SANDBOX_ENV_ALLOWLIST
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    sandboxDefaultTimeoutMs: env.KEYLORE_SANDBOX_DEFAULT_TIMEOUT_MS,
    sandboxMaxOutputBytes: env.KEYLORE_SANDBOX_MAX_OUTPUT_BYTES,
    adapterMaxAttempts: env.KEYLORE_ADAPTER_MAX_ATTEMPTS,
    adapterRetryDelayMs: env.KEYLORE_ADAPTER_RETRY_DELAY_MS,
    adapterCircuitBreakerThreshold: env.KEYLORE_ADAPTER_CIRCUIT_BREAKER_THRESHOLD,
    adapterCircuitBreakerCooldownMs: env.KEYLORE_ADAPTER_CIRCUIT_BREAKER_COOLDOWN_MS,
    notificationWebhookUrl: env.KEYLORE_NOTIFICATION_WEBHOOK_URL || undefined,
    notificationSigningSecret: env.KEYLORE_NOTIFICATION_SIGNING_SECRET || undefined,
    notificationTimeoutMs: env.KEYLORE_NOTIFICATION_TIMEOUT_MS,
    traceCaptureEnabled: env.KEYLORE_TRACE_CAPTURE_ENABLED,
    traceRecentSpanLimit: env.KEYLORE_TRACE_RECENT_SPAN_LIMIT,
    traceExportUrl: env.KEYLORE_TRACE_EXPORT_URL || undefined,
    traceExportAuthHeader: env.KEYLORE_TRACE_EXPORT_AUTH_HEADER || undefined,
    traceExportBatchSize: env.KEYLORE_TRACE_EXPORT_BATCH_SIZE,
    traceExportIntervalMs: env.KEYLORE_TRACE_EXPORT_INTERVAL_MS,
    traceExportTimeoutMs: env.KEYLORE_TRACE_EXPORT_TIMEOUT_MS,
    rotationPlanningHorizonDays: env.KEYLORE_ROTATION_PLANNING_HORIZON_DAYS,
    localQuickstartEnabled,
    localQuickstartBootstrap: localQuickstartEnabled
      ? {
          clientId: LOCAL_ADMIN_CLIENT_ID,
          clientSecret: env.KEYLORE_BOOTSTRAP_ADMIN_CLIENT_SECRET ?? LOCAL_ADMIN_CLIENT_SECRET,
          scopes: [...LOCAL_ADMIN_SCOPES],
        }
      : undefined,
    localAdminBootstrap: hydrated.localAdminBootstrapAvailable
      ? {
          clientId: LOCAL_ADMIN_CLIENT_ID,
          clientSecret: LOCAL_ADMIN_CLIENT_SECRET,
          scopes: [...LOCAL_ADMIN_SCOPES],
        }
      : undefined,
  };
}
