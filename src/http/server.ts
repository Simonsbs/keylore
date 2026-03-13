import { randomUUID } from "node:crypto";
import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { KeyLoreApp } from "../app.js";
import {
  AccessScope,
  accessRequestInputSchema,
  approvalReviewInputSchema,
  AuthContext,
  catalogSearchInputSchema,
  createCredentialInputSchema,
  tokenIssueInputSchema,
  updateCredentialInputSchema,
} from "../domain/types.js";
import { createKeyLoreMcpServer } from "../mcp/create-server.js";
import { authContextFromToken } from "../services/auth-context.js";

interface HttpServerHandle {
  close(): Promise<void>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
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

function enforceRateLimit(
  app: KeyLoreApp,
  req: IncomingMessage,
  limits: Map<string, RateLimitEntry>,
): { limited: boolean; retryAfterSeconds?: number } {
  const key = clientKey(req);
  const now = Date.now();
  const current = limits.get(key);

  if (!current || current.resetAt <= now) {
    limits.set(key, {
      count: 1,
      resetAt: now + app.config.rateLimitWindowMs,
    });
    return { limited: false };
  }

  if (current.count >= app.config.rateLimitMaxRequests) {
    return {
      limited: true,
      retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
  }

  current.count += 1;
  return { limited: false };
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
      },
    };
    return context;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const statusCode = message.startsWith("Missing required scopes") ? 403 : 401;
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
  return authContextFromToken({
    principal: principal ?? "unknown",
    clientId: req.auth?.clientId ?? "unknown",
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
  const limits = new Map<string, RateLimitEntry>();

  const server = http.createServer(async (req, res) => {
    const limited = enforceRateLimit(app, req, limits);
    if (limited.limited) {
      if (limited.retryAfterSeconds) {
        res.setHeader("retry-after", String(limited.retryAfterSeconds));
      }
      respondJson(res, 429, { error: "Rate limit exceeded." });
      return;
    }

    try {
      const url = new URL(
        req.url ?? "/",
        `http://${req.headers.host ?? `${app.config.httpHost}:${app.config.httpPort}`}`,
      );

      if (url.pathname === "/healthz" && req.method === "GET") {
        respondJson(res, 200, { status: "ok", service: app.config.appName });
        return;
      }

      if (url.pathname === "/readyz" && req.method === "GET") {
        respondJson(res, 200, await app.health.readiness());
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
      const message = error instanceof Error ? error.message : "Internal server error";
      const statusCode =
        message.includes("Request body exceeds")
          ? 413
          : message.includes("JSON")
            ? 400
            : message.startsWith("Missing required role")
              ? 403
              : 500;
      app.logger.error({ err: error }, "http_request_failed");
      respondJson(res, statusCode, { error: message });
    }
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
    clientId: basicAuth?.clientId ?? form.get("client_id"),
    clientSecret: basicAuth?.clientSecret ?? form.get("client_secret"),
    grantType: form.get("grant_type"),
    scope,
    resource: form.get("resource") ?? undefined,
  });
  const token = await app.auth.issueToken(payload);
  respondJson(res, 200, token);
}

async function handleApiRequest(
  app: KeyLoreApp,
  req: RequestWithAuth,
  res: ServerResponse,
  url: URL,
): Promise<void> {
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
    const events = await app.broker.listRecentAuditEvents(limit);
    respondJson(res, 200, { events });
    return;
  }

  if (url.pathname === "/v1/auth/clients" && req.method === "GET") {
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
    const clients = await app.auth.listClients();
    respondJson(res, 200, { clients });
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
    const status = url.searchParams.get("status") as Parameters<typeof app.broker.listApprovalRequests>[0];
    const approvals = await app.broker.listApprovalRequests(status);
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

  const credentialId = routeParam(url.pathname, "/v1/catalog/credentials/");
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
