import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import { fileURLToPath } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import * as z from "zod/v4";

import { KeyLoreApp } from "../app.js";
import {
  AccessScope,
  accessRequestInputSchema,
  backupInspectOutputSchema,
  breakGlassRequestInputSchema,
  breakGlassReviewInputSchema,
  authorizationRequestInputSchema,
  authClientCreateInputSchema,
  authClientRotateSecretInputSchema,
  authClientUpdateInputSchema,
  authTokenListQuerySchema,
  approvalReviewInputSchema,
  AuthContext,
  catalogSearchInputSchema,
  coreCredentialCreateInputSchema,
  coreCredentialContextUpdateInputSchema,
  createCredentialInputSchema,
  rotationCompleteInputSchema,
  rotationCreateInputSchema,
  rotationPlanInputSchema,
  rotationRunListOutputSchema,
  rotationTransitionInputSchema,
  runtimeExecutionInputSchema,
  tenantBootstrapInputSchema,
  tenantCreateInputSchema,
  tenantUpdateInputSchema,
  traceExportStatusOutputSchema,
  traceListOutputSchema,
  tokenIssueInputSchema,
  updateCredentialInputSchema,
} from "../domain/types.js";
import { renderAdminPage } from "./admin-ui.js";
import { createKeyLoreMcpServer } from "../mcp/create-server.js";
import { authContextFromToken } from "../services/auth-context.js";

interface HttpServerHandle {
  close(): Promise<void>;
}

interface RequestWithAuth extends IncomingMessage {
  auth?: {
    token: string;
    clientId: string;
    scopes: string[];
    resource?: URL;
    extra?: Record<string, unknown>;
  };
}

const execFileAsync = promisify(execFile);

const applyToolConfigInputSchema = z.object({
  tool: z.enum(["codex", "gemini", "claude"]),
});

const replaceLocalSecretInputSchema = z.object({
  secretValue: z.string().min(1),
});

function respondJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function respondText(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function respondHtml(res: ServerResponse, statusCode: number, body: string): void {
  res.writeHead(statusCode, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function respondRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location });
  res.end();
}

function userHomeDirectory(): string {
  return process.env.HOME || os.homedir();
}

function resolveLocalStdioEntryPath(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(moduleDir, "..", "..");
  const builtEntry = path.join(packageRoot, "dist", "index.js");
  return builtEntry;
}

async function ensureParentDirectory(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

async function readTextFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function codexManagedBlock(stdioEntryPath: string): string {
  const escapedPath = JSON.stringify(stdioEntryPath.replace(/\\/g, "\\\\"));
  return [
    "# >>> keylore managed start",
    "[mcp_servers.keylore_stdio]",
    'command = "node"',
    `args = [${escapedPath}, "--transport", "stdio"]`,
    "# <<< keylore managed end",
  ].join("\n");
}

function replaceManagedTomlBlock(
  content: string,
  tableName: string,
  managedBlock: string,
): { next: string; changed: boolean } {
  const normalized = content.replace(/\r\n/g, "\n");
  const managedStart = "# >>> keylore managed start";
  const managedEnd = "# <<< keylore managed end";
  const managedPattern = new RegExp(
    `${managedStart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${managedEnd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`,
    "m",
  );
  if (managedPattern.test(normalized)) {
    const next = normalized.replace(managedPattern, `${managedBlock}\n`);
    return { next, changed: next !== normalized };
  }

  const lines = normalized.split("\n");
  const tableHeader = `[${tableName}]`;
  const startIndex = lines.findIndex((line) => line.trim() === tableHeader);
  if (startIndex >= 0) {
    let endIndex = lines.length;
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const candidate = lines[index];
      if (candidate && candidate.trim().startsWith("[") && candidate.trim() !== tableHeader) {
        endIndex = index;
        break;
      }
    }
    const before = lines.slice(0, startIndex).join("\n");
    const after = lines.slice(endIndex).join("\n");
    const next = `${before}${before ? "\n" : ""}${managedBlock}${after ? `\n${after}` : ""}`.replace(/\n{3,}/g, "\n\n");
    return { next, changed: next !== normalized };
  }

  const next = `${normalized.trimEnd()}${normalized.trimEnd() ? "\n\n" : ""}${managedBlock}\n`;
  return { next, changed: next !== normalized };
}

async function applyCodexLocalConfig(stdioEntryPath: string): Promise<{ path: string; action: string }> {
  const filePath = path.join(userHomeDirectory(), ".codex", "config.toml");
  const existing = (await readTextFileIfExists(filePath)) ?? "";
  const managedBlock = codexManagedBlock(stdioEntryPath);
  const { next, changed } = replaceManagedTomlBlock(existing, "mcp_servers.keylore_stdio", managedBlock);
  await ensureParentDirectory(filePath);
  if (changed || existing.length === 0) {
    await writeFile(filePath, next, "utf8");
  }
  return {
    path: filePath,
    action: existing.length === 0 ? "created" : changed ? "updated" : "unchanged",
  };
}

async function applyGeminiLocalConfig(stdioEntryPath: string): Promise<{ path: string; action: string }> {
  const filePath = path.join(userHomeDirectory(), ".gemini", "settings.json");
  const existing = (await readTextFileIfExists(filePath)) ?? "";
  let parsed: Record<string, unknown> = {};
  if (existing.trim().length > 0) {
    parsed = JSON.parse(existing) as Record<string, unknown>;
  }

  const currentServers =
    parsed.mcpServers && typeof parsed.mcpServers === "object" && !Array.isArray(parsed.mcpServers)
      ? { ...(parsed.mcpServers as Record<string, unknown>) }
      : {};

  currentServers.keylore_stdio = {
    command: "node",
    args: [stdioEntryPath, "--transport", "stdio"],
  };
  parsed.mcpServers = currentServers;

  const next = `${JSON.stringify(parsed, null, 2)}\n`;
  await ensureParentDirectory(filePath);
  if (next !== existing) {
    await writeFile(filePath, next, "utf8");
  }
  return {
    path: filePath,
    action: existing.length === 0 ? "created" : next !== existing ? "updated" : "unchanged",
  };
}

async function applyClaudeLocalConfig(stdioEntryPath: string): Promise<{ path: string; action: string }> {
  const commandJson = JSON.stringify({
    command: "node",
    args: [stdioEntryPath, "--transport", "stdio"],
  });

  try {
    await execFileAsync("claude", ["mcp", "remove", "-s", "user", "keylore_stdio"]);
  } catch {
    // Ignore missing existing config entries.
  }

  await execFileAsync("claude", ["mcp", "add-json", "-s", "user", "keylore_stdio", commandJson]);
  return {
    path: path.join(userHomeDirectory(), ".claude", "settings.json"),
    action: "updated",
  };
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const contentLengthHeader = req.headers["content-length"];
  const contentLength =
    typeof contentLengthHeader === "string" ? Number.parseInt(contentLengthHeader, 10) : undefined;
  if (contentLength && contentLength > maxBytes) {
    throw new Error(`Request body exceeds the ${maxBytes} byte limit.`);
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) {
      throw new Error(`Request body exceeds the ${maxBytes} byte limit.`);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const raw = await readBody(req, maxBytes);
  if (raw.length === 0) {
    return undefined;
  }
  return JSON.parse(raw);
}

async function readFormBody(req: IncomingMessage, maxBytes: number): Promise<URLSearchParams> {
  const raw = await readBody(req, maxBytes);
  return new URLSearchParams(raw);
}

function routeParam(pathname: string, prefix: string): string | undefined {
  if (!pathname.startsWith(prefix)) {
    return undefined;
  }

  const value = pathname.slice(prefix.length);
  return value.length > 0 ? decodeURIComponent(value) : undefined;
}

function clientKey(req: IncomingMessage): string {
  return req.socket.remoteAddress ?? "unknown";
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const remoteAddress = req.socket.remoteAddress;
  return (
    remoteAddress === "127.0.0.1" ||
    remoteAddress === "::1" ||
    remoteAddress === "::ffff:127.0.0.1"
  );
}

function traceIdFromRequest(req: IncomingMessage): string {
  const header = req.headers["x-trace-id"];
  if (typeof header === "string" && header.trim().length > 0) {
    return header.trim();
  }
  if (Array.isArray(header) && header[0]?.trim()) {
    return header[0].trim();
  }
  return randomUUID();
}

function normalizeRoute(pathname: string): string {
  if (pathname.startsWith("/v1/catalog/credentials/") && pathname.endsWith("/report")) {
    return "/v1/catalog/credentials/:id/report";
  }
  if (pathname.startsWith("/v1/catalog/credentials/")) {
    return "/v1/catalog/credentials/:id";
  }
  if (pathname.startsWith("/v1/approvals/") && pathname.endsWith("/approve")) {
    return "/v1/approvals/:id/approve";
  }
  if (pathname.startsWith("/v1/approvals/") && pathname.endsWith("/deny")) {
    return "/v1/approvals/:id/deny";
  }
  if (pathname.startsWith("/v1/break-glass/") && pathname.endsWith("/approve")) {
    return "/v1/break-glass/:id/approve";
  }
  if (pathname.startsWith("/v1/break-glass/") && pathname.endsWith("/deny")) {
    return "/v1/break-glass/:id/deny";
  }
  if (pathname.startsWith("/v1/break-glass/") && pathname.endsWith("/revoke")) {
    return "/v1/break-glass/:id/revoke";
  }
  if (pathname.startsWith("/v1/auth/clients/") && pathname.endsWith("/rotate-secret")) {
    return "/v1/auth/clients/:id/rotate-secret";
  }
  if (pathname.startsWith("/v1/auth/clients/") && pathname.endsWith("/enable")) {
    return "/v1/auth/clients/:id/enable";
  }
  if (pathname.startsWith("/v1/auth/clients/") && pathname.endsWith("/disable")) {
    return "/v1/auth/clients/:id/disable";
  }
  if (pathname.startsWith("/v1/auth/clients/")) {
    return "/v1/auth/clients/:id";
  }
  if (pathname.startsWith("/v1/auth/tokens/") && pathname.endsWith("/revoke")) {
    return "/v1/auth/tokens/:id/revoke";
  }
  if (pathname.startsWith("/v1/auth/refresh-tokens/") && pathname.endsWith("/revoke")) {
    return "/v1/auth/refresh-tokens/:id/revoke";
  }
  if (pathname === "/v1/tenants/bootstrap") {
    return "/v1/tenants/bootstrap";
  }
  if (pathname.startsWith("/v1/tenants/")) {
    return "/v1/tenants/:id";
  }
  if (pathname.startsWith("/v1/system/backups/")) {
    return "/v1/system/backups/:action";
  }
  if (pathname === "/v1/system/trace-exporter") {
    return "/v1/system/trace-exporter";
  }
  if (pathname === "/v1/system/trace-exporter/flush") {
    return "/v1/system/trace-exporter/flush";
  }
  if (pathname.startsWith("/v1/system/rotations/") && pathname.endsWith("/start")) {
    return "/v1/system/rotations/:id/start";
  }
  if (pathname.startsWith("/v1/system/rotations/") && pathname.endsWith("/complete")) {
    return "/v1/system/rotations/:id/complete";
  }
  if (pathname.startsWith("/v1/system/rotations/") && pathname.endsWith("/fail")) {
    return "/v1/system/rotations/:id/fail";
  }
  if (pathname === "/v1/system/rotations/plan") {
    return "/v1/system/rotations/plan";
  }
  if (pathname.startsWith("/v1/system/rotations/")) {
    return "/v1/system/rotations/:id";
  }
  if (pathname.startsWith("/mcp")) {
    return "/mcp";
  }
  return pathname;
}

function bearerChallenge(app: KeyLoreApp, target: "api" | "mcp"): string {
  const suffix = target === "mcp" ? "mcp" : "api";
  return `Bearer resource_metadata="${app.config.publicBaseUrl}/.well-known/oauth-protected-resource/${suffix}"`;
}

async function authenticateRequest(
  app: KeyLoreApp,
  req: IncomingMessage,
  res: ServerResponse,
  requiredScopes: AccessScope[],
  target: "api" | "mcp",
  requestedResource: string,
): Promise<AuthContext | undefined> {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    res.setHeader("www-authenticate", bearerChallenge(app, target));
    respondJson(res, 401, { error: "Missing bearer token." });
    return undefined;
  }

  const token = authorization.slice("Bearer ".length);
  try {
    const context = await app.auth.authenticateBearerToken(token, requestedResource);
    app.auth.requireScopes(context, requiredScopes);
    (req as RequestWithAuth).auth = {
      token,
      clientId: context.clientId,
      scopes: context.scopes,
      resource: new URL(requestedResource),
      extra: {
        principal: context.principal,
        roles: context.roles,
        tenantId: context.tenantId,
      },
    };
    return context;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const statusCode =
      message.startsWith("Missing required scopes") || message.startsWith("Missing one of the required scopes")
        ? 403
        : 401;
    if (statusCode === 401) {
      res.setHeader("www-authenticate", bearerChallenge(app, target));
    }
    respondJson(res, statusCode, { error: message });
    return undefined;
  }
}

function parseBasicAuthHeader(req: IncomingMessage): { clientId: string; clientSecret: string } | undefined {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Basic ")) {
    return undefined;
  }

  const decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) {
    return undefined;
  }

  return {
    clientId: decoded.slice(0, separator),
    clientSecret: decoded.slice(separator + 1),
  };
}

function parseAuthContextFromRequest(req: RequestWithAuth): AuthContext {
  const principal = typeof req.auth?.extra?.principal === "string" ? req.auth.extra.principal : req.auth?.clientId;
  const roles = Array.isArray(req.auth?.extra?.roles) ? req.auth?.extra?.roles : [];
  const tenantId = typeof req.auth?.extra?.tenantId === "string" ? req.auth.extra.tenantId : undefined;
  return authContextFromToken({
    principal: principal ?? "unknown",
    clientId: req.auth?.clientId ?? "unknown",
    tenantId,
    scopes: (req.auth?.scopes ?? []) as AccessScope[],
    roles: roles as AuthContext["roles"],
    resource: req.auth?.resource?.href,
  });
}

export async function startHttpServer(app: KeyLoreApp): Promise<HttpServerHandle> {
  const transports = new Map<
    string,
    { transport: StreamableHTTPServerTransport; closeServer: () => Promise<void> }
  >();

  const server = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    let routeLabel = req.url ?? "/";
    app.telemetry.adjustGauge("keylore_http_inflight_requests", {}, 1);
    const requestId = randomUUID();
    const traceId = traceIdFromRequest(req);
    res.setHeader("x-request-id", requestId);
    res.setHeader("x-trace-id", traceId);
    res.on("finish", () => {
      app.telemetry.adjustGauge("keylore_http_inflight_requests", {}, -1);
      app.telemetry.recordHttpRequest(
        routeLabel,
        req.method ?? "UNKNOWN",
        res.statusCode,
        Date.now() - startedAt,
      );
    });

    await app.traces.runWithTrace(traceId, async () => {
      await app.traces.withSpan("http.request", { method: req.method ?? "UNKNOWN", route: routeLabel }, async () => {
        try {
          const url = new URL(
            req.url ?? "/",
            `http://${req.headers.host ?? `${app.config.httpHost}:${app.config.httpPort}`}`,
          );
          routeLabel = normalizeRoute(url.pathname);

          const rateLimitExempt =
            url.pathname === "/healthz" || url.pathname === "/readyz" || url.pathname === "/metrics";
          if (!rateLimitExempt) {
            const limited = await app.rateLimits.check(clientKey(req));
            if (limited.limited) {
              if (limited.retryAfterSeconds) {
                res.setHeader("retry-after", String(limited.retryAfterSeconds));
              }
              respondJson(res, 429, { error: "Rate limit exceeded." });
              return;
            }
          }

          if (url.pathname === "/healthz" && req.method === "GET") {
            respondJson(res, 200, { status: "ok", service: app.config.appName });
            return;
          }

          if (url.pathname === "/readyz" && req.method === "GET") {
            respondJson(res, 200, await app.health.readiness());
            return;
          }

          if (url.pathname === "/metrics" && req.method === "GET") {
            res.writeHead(200, {
              "content-type": "text/plain; version=0.0.4; charset=utf-8",
            });
            res.end(app.telemetry.renderPrometheus());
            return;
          }

          if (url.pathname === "/" && req.method === "GET") {
            respondRedirect(res, "/admin");
            return;
          }

          if ((url.pathname === "/admin" || url.pathname === "/admin/") && req.method === "GET") {
            respondHtml(res, 200, renderAdminPage(app));
            return;
          }

          if (url.pathname === "/.well-known/oauth-authorization-server" && req.method === "GET") {
            respondJson(res, 200, app.auth.oauthMetadata());
            return;
          }

          if (
            url.pathname === "/.well-known/oauth-protected-resource/mcp" &&
            req.method === "GET"
          ) {
            respondJson(res, 200, app.auth.protectedResourceMetadata("/mcp"));
            return;
          }

          if (
            url.pathname === "/.well-known/oauth-protected-resource/api" &&
            req.method === "GET"
          ) {
            respondJson(res, 200, app.auth.protectedResourceMetadata("/v1"));
            return;
          }

          if (url.pathname === "/oauth/token" && req.method === "POST") {
            await handleOAuthToken(app, req, res);
            return;
          }

          if (url.pathname === "/oauth/authorize" && req.method === "POST") {
            await handleOAuthAuthorize(app, req as RequestWithAuth, res);
            return;
          }

          if (url.pathname.startsWith("/v1/")) {
            await handleApiRequest(app, req as RequestWithAuth, res, url);
            return;
          }

          if (url.pathname === "/mcp") {
            const authContext = await authenticateRequest(
              app,
              req,
              res,
              ["mcp:use"],
              "mcp",
              `${app.config.publicBaseUrl}/mcp`,
            );
            if (!authContext) {
              return;
            }
            await handleMcpRequest(app, req as RequestWithAuth, res, transports, authContext);
            return;
          }

          respondJson(res, 404, { error: "Not found" });
        } catch (error) {
          const message =
            error instanceof z.ZodError
              ? error.issues.map((issue) => issue.message).join(" ")
              : error instanceof Error
                ? error.message
                : "Internal server error";
          const statusCode =
            error instanceof z.ZodError
              ? 400
              :
            message.includes("Request body exceeds")
              ? 413
              : message.includes("JSON")
                ? 400
                : message === "Invalid client credentials." || message === "Invalid access token."
                  ? 401
                  : message === "Access token expired."
                  ? 401
                  : message === "Access token resource does not match this protected resource."
                    ? 401
                : message === "Invalid authorization code." ||
                    message === "Invalid code verifier." ||
                    message === "Invalid redirect URI." ||
                    message === "Invalid refresh token." ||
                    message === "Refresh token expired." ||
                    message === "Refresh token resource does not match this protected resource."
                  ? 401
                : message.startsWith("Client assertion replay detected") ||
                    message.startsWith("An open rotation already exists") ||
                    message.startsWith("Client already exists") ||
                    message.startsWith("Tenant already exists")
                  ? 409
                  : message.startsWith("Invalid client assertion") ||
                      message.startsWith("Client assertion ") ||
                      message === "Missing private_key_jwt client assertion."
                    ? 401
                    : message === "No valid scopes were granted."
                      ? 400
                      : message.startsWith("private_key_jwt clients do not support") ||
                          message.startsWith("none clients do not support") ||
                          message === "Unknown authorization client." ||
                          message === "Client does not support authorization_code." ||
                          message === "Unsupported grant type for client." ||
                          message === "Requested resource exceeds the caller resource binding." ||
                          message === "No valid roles were granted." ||
                          message === "Unsupported code challenge method."
                  ? 400
                : message.startsWith("Unknown tenant:") ||
                    message.startsWith("Tenant is disabled:") ||
                    message.startsWith("Tenant-scoped restore payload is missing tenant metadata:") ||
                    message.startsWith("Tenant-scoped restore payload includes foreign tenant data:")
                  ? 403
                : message.startsWith("private_key_jwt clients do not support")
                  ? 400
                : message.startsWith("Reviewer has already reviewed")
                  ? 409
                : message.startsWith("Missing required role")
                  ? 403
                  : message === "Tenant access denied."
                    ? 403
                  : message.startsWith("Missing required scopes") ||
                      message.startsWith("Missing one of the required scopes")
                    ? 403
                  : message === "Credential not found."
                    ? 404
                  : message.startsWith("Sandbox env variable")
                    ? 400
                  : 500;
          app.logger.error({ err: error, requestId, traceId, route: routeLabel }, "http_request_failed");
          respondJson(res, statusCode, { error: message });
          return;
        }
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(app.config.httpPort, app.config.httpHost, resolve);
  });

  app.logger.info(
    {
      host: app.config.httpHost,
      port: app.config.httpPort,
    },
    "keylore_http_server_started",
  );

  return {
    close: async () => {
      for (const [sessionId, entry] of transports.entries()) {
        await entry.closeServer();
        transports.delete(sessionId);
      }

      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function handleOAuthToken(
  app: KeyLoreApp,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const basicAuth = parseBasicAuthHeader(req);
  const form = await readFormBody(req, app.config.maxRequestBytes);
  const scope = form.get("scope")?.split(/\s+/).filter(Boolean) as AccessScope[] | undefined;
  const payload = tokenIssueInputSchema.parse({
    clientId: basicAuth?.clientId ?? form.get("client_id") ?? undefined,
    clientSecret: basicAuth?.clientSecret ?? form.get("client_secret") ?? undefined,
    grantType: form.get("grant_type") ?? undefined,
    scope,
    resource: form.get("resource") ?? undefined,
    code: form.get("code") ?? undefined,
    codeVerifier: form.get("code_verifier") ?? undefined,
    redirectUri: form.get("redirect_uri") ?? undefined,
    refreshToken: form.get("refresh_token") ?? undefined,
    clientAssertionType: form.get("client_assertion_type") ?? undefined,
    clientAssertion: form.get("client_assertion") ?? undefined,
  });
  const token = await app.auth.issueToken(payload);
  respondJson(res, 200, token);
}

async function handleOAuthAuthorize(
  app: KeyLoreApp,
  req: RequestWithAuth,
  res: ServerResponse,
): Promise<void> {
  const context = await authenticateRequest(
    app,
    req,
    res,
    [],
    "api",
    `${app.config.publicBaseUrl}/v1`,
  );
  if (!context) {
    return;
  }

  const body = authorizationRequestInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
  const authorization = await app.auth.authorize(context, body);
  respondJson(res, 200, authorization);
}

async function handleApiRequest(
  app: KeyLoreApp,
  req: RequestWithAuth,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (url.pathname === "/v1/core/local-session" && req.method === "POST") {
    if (!app.config.localQuickstartEnabled || !app.config.localQuickstartBootstrap) {
      respondJson(res, 404, { error: "Local quickstart is not enabled." });
      return;
    }
    if (!isLoopbackRequest(req)) {
      respondJson(res, 403, { error: "Local quickstart is only available from loopback." });
      return;
    }

    const token = await app.auth.issueToken({
      clientId: app.config.localQuickstartBootstrap.clientId,
      clientSecret: app.config.localQuickstartBootstrap.clientSecret,
      grantType: "client_credentials",
      scope: [...app.config.localQuickstartBootstrap.scopes] as AccessScope[],
      resource: `${app.config.publicBaseUrl}/v1`,
    });

    respondJson(res, 200, {
      ...token,
      clientId: app.config.localQuickstartBootstrap.clientId,
      resource: `${app.config.publicBaseUrl}/v1`,
      quickstart: true,
    });
    return;
  }

  if (url.pathname === "/v1/core/mcp/check" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const body = z
      .object({
        token: z.string().min(1),
      })
      .parse(await readJsonBody(req, app.config.maxRequestBytes));
    const mcpContext = await app.auth.authenticateBearerToken(
      body.token,
      `${app.config.publicBaseUrl}/mcp`,
    );
    respondJson(res, 200, {
      ok: true,
      clientId: mcpContext.clientId,
      principal: mcpContext.principal,
      scopes: mcpContext.scopes,
      resource: `${app.config.publicBaseUrl}/mcp`,
    });
    return;
  }

  if (url.pathname === "/v1/core/tooling/apply" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    if (!isLoopbackRequest(req) || app.config.environment === "production") {
      respondJson(res, 403, { error: "Local tool setup is only available from loopback development instances." });
      return;
    }

    const body = applyToolConfigInputSchema.parse(
      await readJsonBody(req, app.config.maxRequestBytes),
    );

    let result: { path: string; action: string };
    if (body.tool === "codex") {
      result = await applyCodexLocalConfig(resolveLocalStdioEntryPath());
    } else if (body.tool === "gemini") {
      result = await applyGeminiLocalConfig(resolveLocalStdioEntryPath());
    } else {
      result = await applyClaudeLocalConfig(resolveLocalStdioEntryPath());
    }

    respondJson(res, 200, {
      ok: true,
      tool: body.tool,
      path: result.path,
      action: result.action,
      connection: "local_stdio",
    });
    return;
  }

  if (url.pathname === "/v1/catalog/credentials" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    const credentials = await app.broker.listCredentials(context);
    respondJson(res, 200, { credentials });
    return;
  }

  if (url.pathname === "/v1/catalog/credentials" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const body = createCredentialInputSchema.parse(
      await readJsonBody(req, app.config.maxRequestBytes),
    );
    const credential = await app.broker.createCredential(context, body);
    respondJson(res, 201, { credential });
    return;
  }

  if (url.pathname === "/v1/core/credentials" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const body = coreCredentialCreateInputSchema.parse(
      await readJsonBody(req, app.config.maxRequestBytes),
    );
    const credential = await app.coreMode.createCredential(context, body);
    respondJson(res, 201, { credential });
    return;
  }

  const coreCredentialContextId = routeParam(url.pathname, "/v1/core/credentials/");
  if (coreCredentialContextId && url.pathname.endsWith("/context") && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const credentialId = coreCredentialContextId.replace(/\/context$/, "");
    const credential = await app.broker.getCredential(context, credentialId);
    if (!credential) {
      respondJson(res, 404, { error: "Credential not found" });
      return;
    }
    respondJson(res, 200, { credential });
    return;
  }

  if (coreCredentialContextId && url.pathname.endsWith("/context") && req.method === "PATCH") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const credentialId = coreCredentialContextId.replace(/\/context$/, "");
    const patch = coreCredentialContextUpdateInputSchema.parse(
      await readJsonBody(req, app.config.maxRequestBytes),
    );
    const credential = await app.coreMode.updateCredentialContext(context, credentialId, patch);
    respondJson(res, 200, { credential });
    return;
  }

  if (coreCredentialContextId && url.pathname.endsWith("/local-secret") && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const credentialId = coreCredentialContextId.replace(/\/local-secret$/, "");
    const body = replaceLocalSecretInputSchema.parse(
      await readJsonBody(req, app.config.maxRequestBytes),
    );
    const credential = await app.coreMode.replaceLocalSecret(context, credentialId, body.secretValue);
    respondJson(res, 200, { credential, updatedSecret: true });
    return;
  }

  if (coreCredentialContextId && !url.pathname.endsWith("/context") && req.method === "DELETE") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const deleted = await app.coreMode.deleteCredential(context, coreCredentialContextId);
    respondJson(res, deleted ? 200 : 404, { deleted });
    return;
  }

  if (url.pathname === "/v1/catalog/search" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    const body = catalogSearchInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const credentials = await app.broker.searchCatalog(context, body);
    respondJson(res, 200, { credentials });
    return;
  }

  if (url.pathname === "/v1/access/request" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["broker:use"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    const body = accessRequestInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const decision = await app.broker.requestAccess(context, body);
    respondJson(res, 200, decision);
    return;
  }

  if (url.pathname === "/v1/access/simulate" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["broker:use"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    const body = accessRequestInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const decision = await app.broker.simulateAccess(context, body);
    respondJson(res, 200, decision);
    return;
  }

  if (url.pathname === "/v1/runtime/sandbox" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["sandbox:run"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const body = runtimeExecutionInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const result = await app.broker.runSandboxed(context, body);
    respondJson(res, 200, { result });
    return;
  }

  if (url.pathname === "/v1/audit/events" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["audit:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "auditor"]);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const events = await app.broker.listRecentAuditEvents(context, limit);
    respondJson(res, 200, { events });
    return;
  }

  if (url.pathname === "/v1/auth/clients" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const clients = (await app.auth.listClients()).filter(
      (client) => !context.tenantId || client.tenantId === context.tenantId,
    );
    respondJson(res, 200, { clients });
    return;
  }

  if (url.pathname === "/v1/auth/clients" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const body = authClientCreateInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const client = await app.auth.createClient(context, body);
    respondJson(res, 201, client);
    return;
  }

  if (url.pathname === "/v1/auth/tokens" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const query = authTokenListQuerySchema.parse({
      clientId: url.searchParams.get("clientId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    const tokens = await app.auth.listTokens({
      ...query,
      tenantId: context.tenantId,
    });
    respondJson(res, 200, { tokens });
    return;
  }

  if (url.pathname === "/v1/auth/refresh-tokens" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const query = authTokenListQuerySchema.parse({
      clientId: url.searchParams.get("clientId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
    });
    const tokens = await app.auth.listRefreshTokens({
      ...query,
      tenantId: context.tenantId,
    });
    respondJson(res, 200, { tokens });
    return;
  }

  if (url.pathname === "/v1/tenants" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["admin:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin"]);
    const tenants = await app.tenants.list(context);
    respondJson(res, 200, { tenants });
    return;
  }

  if (url.pathname === "/v1/tenants" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["admin:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin"]);
    const body = tenantCreateInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const tenant = await app.tenants.create(context, body);
    respondJson(res, 201, { tenant });
    return;
  }

  if (url.pathname === "/v1/tenants/bootstrap" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["admin:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin"]);
    const body = tenantBootstrapInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const result = await app.tenants.bootstrap(context, body);
    respondJson(res, 201, result);
    return;
  }

  if (url.pathname === "/v1/system/adapters" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);
    const adapters = await app.broker.adapterHealth();
    respondJson(res, 200, { adapters });
    return;
  }

  if (url.pathname === "/v1/system/maintenance" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);
    respondJson(res, 200, { maintenance: app.maintenance.status() });
    return;
  }

  if (url.pathname === "/v1/system/trace-exporter" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);
    respondJson(res, 200, traceExportStatusOutputSchema.parse({ exporter: app.traceExports.status() }));
    return;
  }

  if (url.pathname === "/v1/system/trace-exporter/flush" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "maintenance_operator"]);
    respondJson(res, 200, traceExportStatusOutputSchema.parse({ exporter: await app.traceExports.flushNow() }));
    return;
  }

  if (url.pathname === "/v1/system/traces" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const traceId = url.searchParams.get("traceId") ?? undefined;
    respondJson(
      res,
      200,
      traceListOutputSchema.parse({
        traces: app.traces.recent(limit, traceId),
      }),
    );
    return;
  }

  if (url.pathname === "/v1/system/maintenance/run" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "maintenance_operator"]);
    const result = await app.maintenance.runOnce();
    respondJson(res, 200, { maintenance: app.maintenance.status(), result });
    return;
  }

  if (url.pathname === "/v1/system/rotations" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:read", "admin:read"]);
    app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator", "auditor"]);
    const rotations = await app.rotations.list({
      tenantId: context.tenantId,
      status: (url.searchParams.get("status") ?? undefined) as
        | "pending"
        | "in_progress"
        | "completed"
        | "failed"
        | "cancelled"
        | undefined,
      credentialId: url.searchParams.get("credentialId") ?? undefined,
    });
    respondJson(res, 200, rotationRunListOutputSchema.parse({ rotations }));
    return;
  }

  if (url.pathname === "/v1/system/rotations" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
    const body = rotationCreateInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const rotation = await app.rotations.createManual(context, body);
    respondJson(res, 201, { rotation });
    return;
  }

  if (url.pathname === "/v1/system/rotations/plan" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
    const body = rotationPlanInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const rotations = await app.rotations.planDue(context, body);
    respondJson(res, 200, rotationRunListOutputSchema.parse({ rotations }));
    return;
  }

  const rotationId = routeParam(url.pathname, "/v1/system/rotations/");
  if (rotationId && req.method === "POST" && url.pathname.endsWith("/start")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
    const body = rotationTransitionInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = rotationId.replace(/\/start$/, "");
    const rotation = await app.rotations.start(id, context, body.note);
    respondJson(res, rotation ? 200 : 404, { rotation: rotation ?? null });
    return;
  }

  if (rotationId && req.method === "POST" && url.pathname.endsWith("/complete")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
    const body = rotationCompleteInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = rotationId.replace(/\/complete$/, "");
    const rotation = await app.rotations.complete(id, context, body);
    respondJson(res, rotation ? 200 : 404, { rotation: rotation ?? null });
    return;
  }

  if (rotationId && req.method === "POST" && url.pathname.endsWith("/fail")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["system:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["system:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
    const body = rotationTransitionInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = rotationId.replace(/\/fail$/, "");
    const rotation = await app.rotations.fail(id, context, body.note);
    respondJson(res, rotation ? 200 : 404, { rotation: rotation ?? null });
    return;
  }

  if (url.pathname === "/v1/system/backups/export" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["backup:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "backup_operator"]);
    const backup = await app.backup.exportBackup(context);
    respondJson(res, 200, { backup, summary: app.backup.summarizeBackup(backup) });
    return;
  }

  if (url.pathname === "/v1/system/backups/inspect" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["backup:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "backup_operator"]);
    const body = z.object({ backup: z.unknown() }).parse(await readJsonBody(req, app.config.maxRequestBytes));
    const backup = app.backup.parseBackupPayload(body.backup);
    respondJson(res, 200, backupInspectOutputSchema.parse({ backup: app.backup.summarizeBackup(backup) }));
    return;
  }

  if (url.pathname === "/v1/system/backups/restore" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["backup:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "backup_operator"]);
    const body = z
      .object({
        confirm: z.literal(true),
        backup: z.unknown(),
      })
      .parse(await readJsonBody(req, app.config.maxRequestBytes));
    const backup = app.backup.parseBackupPayload(body.backup);
    const restored = await app.backup.restoreBackupPayload(backup, context);
    respondJson(res, 200, {
      restored: true,
      backup: app.backup.summarizeBackup(restored),
    });
    return;
  }

  if (url.pathname === "/v1/approvals" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["approval:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "approver"]);
    const status = (url.searchParams.get("status") ?? undefined) as
      | "pending"
      | "approved"
      | "denied"
      | "expired"
      | undefined;
    const approvals = await app.broker.listApprovalRequests(context, status);
    respondJson(res, 200, { approvals });
    return;
  }

  const approvalId = routeParam(url.pathname, "/v1/approvals/");
  if (approvalId && req.method === "POST" && url.pathname.endsWith("/approve")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["approval:review"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "approver"]);
    const body = approvalReviewInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = approvalId.replace(/\/approve$/, "");
    const approval = await app.broker.reviewApprovalRequest(context, id, "approved", body.note);
    respondJson(res, approval ? 200 : 404, { approval: approval ?? null });
    return;
  }

  if (approvalId && req.method === "POST" && url.pathname.endsWith("/deny")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["approval:review"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "approver"]);
    const body = approvalReviewInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = approvalId.replace(/\/deny$/, "");
    const approval = await app.broker.reviewApprovalRequest(context, id, "denied", body.note);
    respondJson(res, approval ? 200 : 404, { approval: approval ?? null });
    return;
  }

  if (url.pathname === "/v1/break-glass" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["breakglass:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "approver", "auditor", "breakglass_operator"]);
    const requests = await app.broker.listBreakGlassRequests(context, {
      status: (url.searchParams.get("status") ?? undefined) as
        | "pending"
        | "active"
        | "denied"
        | "expired"
        | "revoked"
        | undefined,
      requestedBy: url.searchParams.get("requestedBy") ?? undefined,
    });
    respondJson(res, 200, { requests });
    return;
  }

  if (url.pathname === "/v1/break-glass" && req.method === "POST") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["breakglass:request"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "breakglass_operator"]);
    const body = breakGlassRequestInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const request = await app.broker.createBreakGlassRequest(context, body);
    respondJson(res, 201, { request });
    return;
  }

  const breakGlassId = routeParam(url.pathname, "/v1/break-glass/");
  if (breakGlassId && req.method === "POST" && url.pathname.endsWith("/approve")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["breakglass:review"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "approver"]);
    const body = breakGlassReviewInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = breakGlassId.replace(/\/approve$/, "");
    const request = await app.broker.reviewBreakGlassRequest(context, id, "active", body.note);
    respondJson(res, request ? 200 : 404, { request: request ?? null });
    return;
  }

  if (breakGlassId && req.method === "POST" && url.pathname.endsWith("/deny")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["breakglass:review"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "approver"]);
    const body = breakGlassReviewInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = breakGlassId.replace(/\/deny$/, "");
    const request = await app.broker.reviewBreakGlassRequest(context, id, "denied", body.note);
    respondJson(res, request ? 200 : 404, { request: request ?? null });
    return;
  }

  if (breakGlassId && req.method === "POST" && url.pathname.endsWith("/revoke")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["breakglass:review"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "approver", "breakglass_operator"]);
    const body = breakGlassReviewInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const id = breakGlassId.replace(/\/revoke$/, "");
    const request = await app.broker.revokeBreakGlassRequest(context, id, body.note);
    respondJson(res, request ? 200 : 404, { request: request ?? null });
    return;
  }

  const authClientId = routeParam(url.pathname, "/v1/auth/clients/");
  if (authClientId && req.method === "PATCH") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const patch = authClientUpdateInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const client = await app.auth.updateClient(context, authClientId, patch);
    respondJson(res, client ? 200 : 404, { client: client ?? null });
    return;
  }

  if (authClientId && req.method === "POST" && url.pathname.endsWith("/rotate-secret")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const body = authClientRotateSecretInputSchema.parse(
      await readJsonBody(req, app.config.maxRequestBytes),
    );
    const clientId = authClientId.replace(/\/rotate-secret$/, "");
    const client = await app.auth.rotateClientSecret(context, clientId, body.clientSecret);
    respondJson(res, client ? 200 : 404, client ?? { client: null });
    return;
  }

  if (authClientId && req.method === "POST" && url.pathname.endsWith("/enable")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const clientId = authClientId.replace(/\/enable$/, "");
    const client = await app.auth.updateClient(context, clientId, { status: "active" });
    respondJson(res, client ? 200 : 404, { client: client ?? null });
    return;
  }

  if (authClientId && req.method === "POST" && url.pathname.endsWith("/disable")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const clientId = authClientId.replace(/\/disable$/, "");
    const client = await app.auth.updateClient(context, clientId, { status: "disabled" });
    respondJson(res, client ? 200 : 404, { client: client ?? null });
    return;
  }

  const tokenId = routeParam(url.pathname, "/v1/auth/tokens/");
  if (tokenId && req.method === "POST" && url.pathname.endsWith("/revoke")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const id = tokenId.replace(/\/revoke$/, "");
    const token = await app.auth.revokeToken(context, id);
    respondJson(res, token ? 200 : 404, { token: token ?? null });
    return;
  }

  const refreshTokenId = routeParam(url.pathname, "/v1/auth/refresh-tokens/");
  if (refreshTokenId && req.method === "POST" && url.pathname.endsWith("/revoke")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["auth:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireAnyScope(context, ["auth:write", "admin:write"]);
    app.auth.requireRoles(context, ["admin", "auth_admin"]);
    const id = refreshTokenId.replace(/\/revoke$/, "");
    const token = await app.auth.revokeRefreshToken(context, id);
    respondJson(res, token ? 200 : 404, { token: token ?? null });
    return;
  }

  const tenantId = routeParam(url.pathname, "/v1/tenants/");
  if (tenantId && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["admin:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin"]);
    const tenant = await app.tenants.get(context, tenantId);
    respondJson(res, tenant ? 200 : 404, { tenant: tenant ?? null });
    return;
  }

  if (tenantId && req.method === "PATCH") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["admin:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin"]);
    const patch = tenantUpdateInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const tenant = await app.tenants.update(context, tenantId, patch);
    respondJson(res, tenant ? 200 : 404, { tenant: tenant ?? null });
    return;
  }

  const credentialId = routeParam(url.pathname, "/v1/catalog/credentials/");
  if (credentialId && req.method === "GET" && url.pathname.endsWith("/report")) {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator", "auditor"]);
    const id = credentialId.replace(/\/report$/, "");
    const reports = await app.broker.listCredentialReports(context, id);
    respondJson(res, reports.length > 0 ? 200 : 404, { reports });
    return;
  }

  if (url.pathname === "/v1/catalog/reports" && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator", "auditor"]);
    const reports = await app.broker.listCredentialReports(context);
    respondJson(res, 200, { reports });
    return;
  }

  if (credentialId && req.method === "GET") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:read"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    const credential = await app.broker.getCredential(context, credentialId);
    if (!credential) {
      respondJson(res, 404, { error: "Credential not found" });
      return;
    }

    respondJson(res, 200, { credential });
    return;
  }

  if (credentialId && req.method === "PATCH") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const patch = updateCredentialInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const credential = await app.broker.updateCredential(context, credentialId, patch);
    respondJson(res, 200, { credential });
    return;
  }

  if (credentialId && req.method === "DELETE") {
    const context = await authenticateRequest(
      app,
      req,
      res,
      ["catalog:write"],
      "api",
      `${app.config.publicBaseUrl}/v1`,
    );
    if (!context) {
      return;
    }
    app.auth.requireRoles(context, ["admin", "operator"]);
    const deleted = await app.broker.deleteCredential(context, credentialId);
    respondJson(res, deleted ? 200 : 404, { deleted });
    return;
  }

  respondJson(res, 404, { error: "Not found" });
}

async function handleMcpRequest(
  app: KeyLoreApp,
  req: RequestWithAuth,
  res: ServerResponse,
  transports: Map<string, { transport: StreamableHTTPServerTransport; closeServer: () => Promise<void> }>,
  _context: AuthContext,
): Promise<void> {
  const sessionIdHeader = req.headers["mcp-session-id"];
  const sessionId =
    typeof sessionIdHeader === "string" ? sessionIdHeader : sessionIdHeader?.[0];

  if (req.method === "GET") {
    if (!sessionId) {
      respondText(res, 400, "Missing MCP session identifier.");
      return;
    }

    const existing = transports.get(sessionId);
    if (!existing) {
      respondText(res, 404, "Unknown MCP session.");
      return;
    }

    await existing.transport.handleRequest(req, res);
    return;
  }

  if (req.method === "DELETE") {
    if (!sessionId) {
      respondText(res, 400, "Missing MCP session identifier.");
      return;
    }

    const existing = transports.get(sessionId);
    if (!existing) {
      respondText(res, 404, "Unknown MCP session.");
      return;
    }

    await existing.transport.handleRequest(req, res);
    await existing.closeServer();
    transports.delete(sessionId);
    return;
  }

  if (req.method !== "POST") {
    respondText(res, 405, "Method not allowed.");
    return;
  }

  const body = await readJsonBody(req, app.config.maxRequestBytes);

  if (sessionId) {
    const existing = transports.get(sessionId);
    if (!existing) {
      respondText(res, 404, "Unknown MCP session.");
      return;
    }

    await existing.transport.handleRequest(req, res, body);
    return;
  }

  if (!isInitializeRequest(body)) {
    respondJson(res, 400, {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Initialization request required.",
      },
      id: null,
    });
    return;
  }

  const connectedServer = createKeyLoreMcpServer(app);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (newSessionId) => {
      transports.set(newSessionId, {
        transport,
        closeServer: async () => {
          await connectedServer.close();
          await transport.close();
        },
      });
    },
  });

  transport.onclose = () => {
    if (transport.sessionId) {
      transports.delete(transport.sessionId);
    }
  };

  await connectedServer.connect(transport);
  await transport.handleRequest(req, res, body);
}
