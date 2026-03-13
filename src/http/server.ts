import { randomUUID } from "node:crypto";
import http, { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { KeyLoreApp } from "../app.js";
import {
  accessRequestInputSchema,
  catalogSearchInputSchema,
  createCredentialInputSchema,
  updateCredentialInputSchema,
} from "../domain/types.js";
import { createKeyLoreMcpServer } from "../mcp/create-server.js";

interface HttpServerHandle {
  close(): Promise<void>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
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

async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
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

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (raw.length === 0) {
    return undefined;
  }

  return JSON.parse(raw);
}

function extractPrincipal(req: IncomingMessage, app: KeyLoreApp): string {
  const headerValue = req.headers["x-keylore-principal"];
  return typeof headerValue === "string" && headerValue.trim().length > 0
    ? headerValue
    : app.config.defaultPrincipal;
}

function requireBearerToken(req: IncomingMessage, app: KeyLoreApp): boolean {
  if (!app.config.mcpBearerToken) {
    return true;
  }

  const authorization = req.headers.authorization;
  return authorization === `Bearer ${app.config.mcpBearerToken}`;
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

      if (url.pathname.startsWith("/v1/")) {
        await handleApiRequest(app, req, res, url);
        return;
      }

      if (url.pathname === "/mcp") {
        if (!requireBearerToken(req, app)) {
          respondJson(res, 401, { error: "Unauthorized" });
          return;
        }

        await handleMcpRequest(app, req, res, transports);
        return;
      }

      respondJson(res, 404, { error: "Not found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error";
      const statusCode =
        message.includes("Request body exceeds") ? 413 : message.includes("JSON") ? 400 : 500;
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

async function handleApiRequest(
  app: KeyLoreApp,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const principal = extractPrincipal(req, app);

  if (url.pathname === "/v1/catalog/credentials" && req.method === "GET") {
    const credentials = await app.broker.listCredentials(principal);
    respondJson(res, 200, { credentials });
    return;
  }

  if (url.pathname === "/v1/catalog/credentials" && req.method === "POST") {
    const body = createCredentialInputSchema.parse(
      await readJsonBody(req, app.config.maxRequestBytes),
    );
    const credential = await app.broker.createCredential(principal, body);
    respondJson(res, 201, { credential });
    return;
  }

  const credentialId = routeParam(url.pathname, "/v1/catalog/credentials/");
  if (credentialId && req.method === "GET") {
    const credential = await app.broker.getCredential(principal, credentialId);
    if (!credential) {
      respondJson(res, 404, { error: "Credential not found" });
      return;
    }

    respondJson(res, 200, { credential });
    return;
  }

  if (credentialId && req.method === "PATCH") {
    const patch = updateCredentialInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const credential = await app.broker.updateCredential(principal, credentialId, patch);
    respondJson(res, 200, { credential });
    return;
  }

  if (credentialId && req.method === "DELETE") {
    const deleted = await app.broker.deleteCredential(principal, credentialId);
    respondJson(res, deleted ? 200 : 404, { deleted });
    return;
  }

  if (url.pathname === "/v1/catalog/search" && req.method === "POST") {
    const body = catalogSearchInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const credentials = await app.broker.searchCatalog(principal, body);
    respondJson(res, 200, { credentials });
    return;
  }

  if (url.pathname === "/v1/access/request" && req.method === "POST") {
    const body = accessRequestInputSchema.parse(await readJsonBody(req, app.config.maxRequestBytes));
    const decision = await app.broker.requestAccess(principal, body);
    respondJson(res, 200, decision);
    return;
  }

  if (url.pathname === "/v1/audit/events" && req.method === "GET") {
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "20", 10);
    const events = await app.broker.listRecentAuditEvents(limit);
    respondJson(res, 200, { events });
    return;
  }

  respondJson(res, 404, { error: "Not found" });
}

async function handleMcpRequest(
  app: KeyLoreApp,
  req: IncomingMessage,
  res: ServerResponse,
  transports: Map<string, { transport: StreamableHTTPServerTransport; closeServer: () => Promise<void> }>,
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
