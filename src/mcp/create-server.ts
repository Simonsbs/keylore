import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { KeyLoreApp } from "../app.js";
import {
  accessDecisionSchema,
  auditRecentOutputSchema,
  catalogGetOutputSchema,
  catalogSearchInputSchema,
  catalogSearchOutputSchema,
  operationSchema,
  sensitivitySchema,
  scopeTierSchema,
} from "../domain/types.js";
import { authContextFromToken, localOperatorContext } from "../services/auth-context.js";

function makeText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function contextFromExtra(
  app: KeyLoreApp,
  extra?: {
    authInfo?: {
      clientId: string;
      scopes: string[];
      resource?: URL;
      extra?: Record<string, unknown>;
    };
  },
) {
  if (!extra?.authInfo) {
    return localOperatorContext(app.config.defaultPrincipal);
  }

  return authContextFromToken({
    principal:
      typeof extra.authInfo.extra?.principal === "string"
        ? extra.authInfo.extra.principal
        : extra.authInfo.clientId,
    clientId: extra.authInfo.clientId,
    scopes: extra.authInfo.scopes as Parameters<typeof authContextFromToken>[0]["scopes"],
    roles: (Array.isArray(extra.authInfo.extra?.roles)
      ? extra.authInfo.extra.roles
      : []) as Parameters<typeof authContextFromToken>[0]["roles"],
    resource: extra.authInfo.resource?.href,
  });
}

export function createKeyLoreMcpServer(app: KeyLoreApp): McpServer {
  const server = new McpServer({
    name: "keylore-mcp",
    version: app.config.version,
  });

  server.registerTool(
    "catalog_search",
    {
      description:
        "Search credential metadata without exposing secret values. Use this before attempting access.",
      inputSchema: {
        query: z.string().optional(),
        service: z.string().optional(),
        owner: z.string().optional(),
        scopeTier: scopeTierSchema.optional(),
        sensitivity: sensitivitySchema.optional(),
        status: z.enum(["active", "disabled"]).optional(),
        tag: z.string().optional(),
        limit: z.number().int().min(1).max(50).default(10),
      },
      outputSchema: catalogSearchOutputSchema,
    },
    async (input, extra) => {
      const parsed = catalogSearchInputSchema.parse(input);
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["catalog:read"]);
      const results = await app.broker.searchCatalog(context, parsed);

      return {
        content: [{ type: "text", text: makeText(results) }],
        structuredContent: {
          results,
          count: results.length,
        },
      };
    },
  );

  server.registerTool(
    "catalog_get",
    {
      description: "Return one credential metadata record by identifier, still without secrets.",
      inputSchema: {
        credentialId: z.string().min(1),
      },
      outputSchema: catalogGetOutputSchema,
    },
    async ({ credentialId }, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["catalog:read"]);
      const result = await app.broker.getCredential(context, credentialId);

      return {
        content: [
          {
            type: "text",
            text: makeText(result ?? { error: "Credential not found." }),
          },
        ],
        structuredContent: {
          result: result ?? null,
        },
      };
    },
  );

  server.registerTool(
    "access_request",
    {
      description:
        "Evaluate policy and, if allowed, execute a constrained authenticated proxy request without returning secret material.",
      inputSchema: {
        credentialId: z.string().min(1),
        operation: operationSchema,
        targetUrl: z.string().url(),
        headers: z.record(z.string(), z.string()).optional(),
        payload: z.string().optional(),
      },
      outputSchema: accessDecisionSchema,
    },
    async (input, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["broker:use"]);
      const decision = await app.broker.requestAccess(context, input);

      return {
        content: [{ type: "text", text: makeText(decision) }],
        structuredContent: decision,
      };
    },
  );

  server.registerTool(
    "audit_recent",
    {
      description: "Read recent audit events for search, authorization, and credential use.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20),
      },
      outputSchema: auditRecentOutputSchema,
    },
    async ({ limit }, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["audit:read"]);
      app.auth.requireRoles(context, ["admin", "auditor"]);
      const events = await app.broker.listRecentAuditEvents(limit);

      return {
        content: [{ type: "text", text: makeText(events) }],
        structuredContent: {
          events,
        },
      };
    },
  );

  return server;
}
