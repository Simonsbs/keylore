import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { KeyLoreApp } from "../app.js";
import {
  accessDecisionSchema,
  adapterHealthListOutputSchema,
  auditRecentOutputSchema,
  catalogGetOutputSchema,
  credentialStatusReportListOutputSchema,
  catalogSearchInputSchema,
  catalogSearchOutputSchema,
  operationSchema,
  runtimeExecutionResultSchema,
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
    "catalog_report",
    {
      description: "Inspect credential rotation and expiry status without exposing secret values.",
      inputSchema: {
        credentialId: z.string().min(1).optional(),
      },
      outputSchema: credentialStatusReportListOutputSchema,
    },
    async ({ credentialId }, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["catalog:read"]);
      app.auth.requireRoles(context, ["admin", "operator", "auditor"]);
      const reports = await app.broker.listCredentialReports(context, credentialId);

      return {
        content: [{ type: "text", text: makeText(reports) }],
        structuredContent: {
          reports,
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
        approvalId: z.string().uuid().optional(),
        dryRun: z.boolean().optional(),
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
    "policy_simulate",
    {
      description:
        "Evaluate policy for a proposed access request without executing the outbound call or creating approval side effects.",
      inputSchema: {
        credentialId: z.string().min(1),
        operation: operationSchema,
        targetUrl: z.string().url(),
        headers: z.record(z.string(), z.string()).optional(),
        payload: z.string().optional(),
        approvalId: z.string().uuid().optional(),
      },
      outputSchema: accessDecisionSchema,
    },
    async (input, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["broker:use"]);
      const decision = await app.broker.simulateAccess(context, input);

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

  server.registerTool(
    "system_adapters",
    {
      description: "Read adapter availability and health for configured secret backends.",
      inputSchema: {},
      outputSchema: adapterHealthListOutputSchema,
    },
    async (_input, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["admin:read"]);
      app.auth.requireRoles(context, ["admin", "operator", "auditor"]);
      const adapters = await app.broker.adapterHealth();

      return {
        content: [{ type: "text", text: makeText(adapters) }],
        structuredContent: {
          adapters,
        },
      };
    },
  );

  server.registerTool(
    "runtime_run_sandboxed",
    {
      description:
        "Run a tightly allowlisted command with a credential injected into a temporary process environment, with output scrubbing.",
      inputSchema: {
        credentialId: z.string().min(1),
        command: z.string().min(1),
        args: z.array(z.string()).max(32).default([]),
        secretEnvName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
        env: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string()).optional(),
        timeoutMs: z.number().int().min(100).max(60000).optional(),
      },
      outputSchema: runtimeExecutionResultSchema,
    },
    async (input, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["sandbox:run"]);
      app.auth.requireRoles(context, ["admin", "operator"]);
      const result = await app.broker.runSandboxed(context, input);

      return {
        content: [{ type: "text", text: makeText(result) }],
        structuredContent: result,
      };
    },
  );

  return server;
}
