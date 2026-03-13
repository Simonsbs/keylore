import path from "node:path";

import * as z from "zod/v4";

export interface KeyLoreConfig {
  appName: string;
  version: string;
  dataDir: string;
  bootstrapCatalogPath: string;
  bootstrapPolicyPath: string;
  migrationsDir: string;
  databaseUrl: string;
  databasePoolMax: number;
  httpHost: string;
  httpPort: number;
  environment: string;
  defaultPrincipal: string;
  mcpBearerToken: string | undefined;
  logLevel: string;
  bootstrapFromFiles: boolean;
  maxRequestBytes: number;
  outboundTimeoutMs: number;
  maxResponseBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
}

const envSchema = z.object({
  KEYLORE_DATA_DIR: z.string().optional(),
  KEYLORE_CATALOG_FILE: z.string().optional(),
  KEYLORE_POLICY_FILE: z.string().optional(),
  KEYLORE_MIGRATIONS_DIR: z.string().optional(),
  KEYLORE_DATABASE_URL: z.string().min(1),
  KEYLORE_DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  KEYLORE_HTTP_HOST: z.string().default("127.0.0.1"),
  KEYLORE_HTTP_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  KEYLORE_ENVIRONMENT: z.string().default("development"),
  KEYLORE_DEFAULT_PRINCIPAL: z.string().default("local-operator"),
  KEYLORE_MCP_BEARER_TOKEN: z.string().optional(),
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
});

export function loadConfig(cwd = process.cwd()): KeyLoreConfig {
  const env = envSchema.parse(process.env);
  const dataDir = path.resolve(cwd, env.KEYLORE_DATA_DIR ?? "data");

  return {
    appName: "keylore",
    version: "0.2.0",
    dataDir,
    bootstrapCatalogPath: path.resolve(dataDir, env.KEYLORE_CATALOG_FILE ?? "catalog.json"),
    bootstrapPolicyPath: path.resolve(dataDir, env.KEYLORE_POLICY_FILE ?? "policies.json"),
    migrationsDir: path.resolve(cwd, env.KEYLORE_MIGRATIONS_DIR ?? "migrations"),
    databaseUrl: env.KEYLORE_DATABASE_URL,
    databasePoolMax: env.KEYLORE_DATABASE_POOL_MAX,
    httpHost: env.KEYLORE_HTTP_HOST,
    httpPort: env.KEYLORE_HTTP_PORT,
    environment: env.KEYLORE_ENVIRONMENT,
    defaultPrincipal: env.KEYLORE_DEFAULT_PRINCIPAL,
    mcpBearerToken: env.KEYLORE_MCP_BEARER_TOKEN || undefined,
    logLevel: env.KEYLORE_LOG_LEVEL,
    bootstrapFromFiles: env.KEYLORE_BOOTSTRAP_FROM_FILES,
    maxRequestBytes: env.KEYLORE_MAX_REQUEST_BYTES,
    outboundTimeoutMs: env.KEYLORE_OUTBOUND_TIMEOUT_MS,
    maxResponseBytes: env.KEYLORE_MAX_RESPONSE_BYTES,
    rateLimitWindowMs: env.KEYLORE_RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: env.KEYLORE_RATE_LIMIT_MAX_REQUESTS,
  };
}
