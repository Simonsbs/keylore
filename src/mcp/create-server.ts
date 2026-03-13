import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { KeyLoreApp } from "../app.js";
import {
  catalogSearchInputSchema,
  operationSchema,
  sensitivitySchema,
  scopeTierSchema,
} from "../domain/types.js";

function makeText(value: unknown): string {
  return JSON.stringify(value, null, 2);
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
    },
    async (input) => {
      const parsed = catalogSearchInputSchema.parse(input);
      const results = await app.broker.searchCatalog(app.config.defaultPrincipal, parsed);

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
    },
    async ({ credentialId }) => {
      const result = await app.broker.getCredential(app.config.defaultPrincipal, credentialId);

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
    },
    async (input) => {
      const decision = await app.broker.requestAccess(app.config.defaultPrincipal, input);

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
    },
    async ({ limit }) => {
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
