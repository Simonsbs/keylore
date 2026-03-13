import path from "node:path";

export interface KeyLoreConfig {
  appName: string;
  version: string;
  dataDir: string;
  catalogPath: string;
  policyPath: string;
  auditPath: string;
  httpHost: string;
  httpPort: number;
  environment: string;
  defaultPrincipal: string;
  mcpBearerToken: string | undefined;
  logLevel: string;
}

export function loadConfig(cwd = process.cwd()): KeyLoreConfig {
  const dataDir = path.resolve(cwd, process.env.KEYLORE_DATA_DIR ?? "data");

  return {
    appName: "keylore",
    version: "0.1.0",
    dataDir,
    catalogPath: path.resolve(dataDir, process.env.KEYLORE_CATALOG_FILE ?? "catalog.json"),
    policyPath: path.resolve(dataDir, process.env.KEYLORE_POLICY_FILE ?? "policies.json"),
    auditPath: path.resolve(dataDir, process.env.KEYLORE_AUDIT_FILE ?? "audit.ndjson"),
    httpHost: process.env.KEYLORE_HTTP_HOST ?? "127.0.0.1",
    httpPort: Number.parseInt(process.env.KEYLORE_HTTP_PORT ?? "8787", 10),
    environment: process.env.KEYLORE_ENVIRONMENT ?? "development",
    defaultPrincipal: process.env.KEYLORE_DEFAULT_PRINCIPAL ?? "local-operator",
    mcpBearerToken: process.env.KEYLORE_MCP_BEARER_TOKEN || undefined,
    logLevel: process.env.KEYLORE_LOG_LEVEL ?? "info",
  };
}
