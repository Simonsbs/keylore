import * as z from "zod/v4";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { KeyLoreApp } from "../app.js";
import {
  accessDecisionSchema,
  adapterHealthListOutputSchema,
  auditRecentOutputSchema,
  breakGlassListOutputSchema,
  breakGlassRequestInputSchema,
  breakGlassRequestSchema,
  breakGlassReviewInputSchema,
  catalogGetOutputSchema,
  credentialStatusReportListOutputSchema,
  catalogSearchInputSchema,
  catalogSearchOutputSchema,
  maintenanceStatusOutputSchema,
  operationSchema,
  rotationRunListOutputSchema,
  rotationPlanInputSchema,
  rotationCreateInputSchema,
  rotationCompleteInputSchema,
  runtimeExecutionResultSchema,
  rotationRunSchema,
  traceExportStatusOutputSchema,
  traceListOutputSchema,
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
    tenantId:
      typeof extra.authInfo.extra?.tenantId === "string" ? extra.authInfo.extra.tenantId : undefined,
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
        "Search credential metadata without exposing secret values. Use this first to find the best credential by purpose, service, domain, permitted operation, tags, and LLM/user context. Do not assume the requested token name matches the credential ID.",
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
      description:
        "Return one credential metadata record by identifier, still without secrets. Use this after search when you need to inspect one candidate more closely before choosing it for access.",
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
        "Evaluate policy and, if allowed, execute a constrained authenticated proxy request without returning secret material. Use the credential selected from metadata context, domains, and allowed operations, not just because its name looks similar to the request.",
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
        "Evaluate policy for a proposed access request without executing the outbound call or creating approval side effects. Use this to compare likely credentials and confirm the context-matched choice before making a live request.",
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
      const events = await app.broker.listRecentAuditEvents(context, limit);

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
      app.auth.requireScopes(context, ["system:read"]);
      app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);
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
    "system_maintenance_status",
    {
      description: "Read background maintenance loop status and last cleanup result.",
      inputSchema: {},
      outputSchema: maintenanceStatusOutputSchema,
    },
    async (_input, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["system:read"]);
      app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);

      return {
        content: [{ type: "text", text: makeText(app.maintenance.status()) }],
        structuredContent: {
          maintenance: app.maintenance.status(),
        },
      };
    },
  );

  server.registerTool(
    "system_recent_traces",
    {
      description: "Inspect recent in-memory trace spans for HTTP, review, notification, and operator flows.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).default(20),
        traceId: z.string().optional(),
      },
      outputSchema: traceListOutputSchema,
    },
    async ({ limit, traceId }, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["system:read"]);
      app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);

      return {
        content: [{ type: "text", text: makeText(app.traces.recent(limit, traceId)) }],
        structuredContent: {
          traces: app.traces.recent(limit, traceId),
        },
      };
    },
  );

  server.registerTool(
    "system_trace_exporter_status",
    {
      description: "Read external trace-export pipeline status and pending queue depth.",
      inputSchema: {},
      outputSchema: traceExportStatusOutputSchema,
    },
    async (_input, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["system:read"]);
      app.auth.requireRoles(context, ["admin", "maintenance_operator", "auditor"]);

      return {
        content: [{ type: "text", text: makeText(app.traceExports.status()) }],
        structuredContent: {
          exporter: app.traceExports.status(),
        },
      };
    },
  );

  server.registerTool(
    "system_rotation_list",
    {
      description: "List credential rotation workflow runs and their current status.",
      inputSchema: {
        status: z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]).optional(),
        credentialId: z.string().optional(),
      },
      outputSchema: rotationRunListOutputSchema,
    },
    async ({ status, credentialId }, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["system:read"]);
      app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator", "auditor"]);
      const rotations = await app.rotations.list({ tenantId: context.tenantId, status, credentialId });

      return {
        content: [{ type: "text", text: makeText(rotations) }],
        structuredContent: {
          rotations,
        },
      };
    },
  );

  server.registerTool(
    "system_rotation_plan",
    {
      description: "Create pending rotation runs for credentials approaching expiry or backend rotation windows.",
      inputSchema: {
        horizonDays: z.number().int().min(1).max(365).default(14),
        credentialIds: z.array(z.string()).optional(),
      },
      outputSchema: rotationRunListOutputSchema,
    },
    async (input, extra) => {
      const parsed = rotationPlanInputSchema.parse(input);
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["system:write"]);
      app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
      const rotations = await app.rotations.planDue(context, parsed);

      return {
        content: [{ type: "text", text: makeText(rotations) }],
        structuredContent: {
          rotations,
        },
      };
    },
  );

  server.registerTool(
    "system_rotation_create",
    {
      description: "Create a manual rotation workflow run for a specific credential.",
      inputSchema: {
        credentialId: z.string().min(1),
        reason: z.string().min(8).max(2000),
        dueAt: z.string().datetime().optional(),
        note: z.string().max(2000).optional(),
      },
      outputSchema: z.object({ rotation: rotationRunSchema }),
    },
    async (input, extra) => {
      const parsed = rotationCreateInputSchema.parse(input);
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["system:write"]);
      app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
      const rotation = await app.rotations.createManual(context, parsed);

      return {
        content: [{ type: "text", text: makeText(rotation) }],
        structuredContent: {
          rotation,
        },
      };
    },
  );

  server.registerTool(
    "system_rotation_complete",
    {
      description: "Mark a rotation workflow run completed and optionally update the credential binding reference.",
      inputSchema: {
        rotationId: z.string().uuid(),
        note: z.string().max(2000).optional(),
        targetRef: z.string().optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        lastValidatedAt: z.string().datetime().optional(),
      },
      outputSchema: z.object({ rotation: rotationRunSchema.nullable() }),
    },
    async ({ rotationId, ...input }, extra) => {
      const parsed = rotationCompleteInputSchema.parse(input);
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["system:write"]);
      app.auth.requireRoles(context, ["admin", "operator", "maintenance_operator"]);
      const rotation = await app.rotations.complete(rotationId, context, parsed);

      return {
        content: [{ type: "text", text: makeText(rotation ?? { error: "Rotation not found." }) }],
        structuredContent: {
          rotation: rotation ?? null,
        },
      };
    },
  );

  server.registerTool(
    "break_glass_request",
    {
      description: "Create an audited emergency-access request for a specific credential and target.",
      inputSchema: {
        credentialId: z.string().min(1),
        operation: operationSchema,
        targetUrl: z.string().url(),
        justification: z.string().min(12).max(2000),
        requestedDurationSeconds: z.number().int().min(60).max(86400).optional(),
      },
      outputSchema: z.object({ request: breakGlassRequestSchema }),
    },
    async (input, extra) => {
      const parsed = breakGlassRequestInputSchema.parse(input);
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["breakglass:request"]);
      app.auth.requireRoles(context, ["admin", "breakglass_operator"]);
      const request = await app.broker.createBreakGlassRequest(context, parsed);

      return {
        content: [{ type: "text", text: makeText(request) }],
        structuredContent: { request },
      };
    },
  );

  server.registerTool(
    "break_glass_list",
    {
      description: "List emergency-access requests and their review status.",
      inputSchema: {
        status: z.enum(["pending", "active", "denied", "expired", "revoked"]).optional(),
        requestedBy: z.string().optional(),
      },
      outputSchema: breakGlassListOutputSchema,
    },
    async ({ status, requestedBy }, extra) => {
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["breakglass:read"]);
      app.auth.requireRoles(context, ["admin", "approver", "auditor", "breakglass_operator"]);
      const requests = await app.broker.listBreakGlassRequests(context, { status, requestedBy });

      return {
        content: [{ type: "text", text: makeText(requests) }],
        structuredContent: {
          requests,
        },
      };
    },
  );

  server.registerTool(
    "break_glass_review",
    {
      description: "Approve, deny, or revoke an emergency-access request.",
      inputSchema: {
        requestId: z.string().uuid(),
        action: z.enum(["approve", "deny", "revoke"]),
        note: z.string().max(1000).optional(),
      },
      outputSchema: z.object({ request: breakGlassRequestSchema.nullable() }),
    },
    async ({ requestId, action, note }, extra) => {
      const parsedNote = breakGlassReviewInputSchema.parse({ note }).note;
      const context = contextFromExtra(app, extra);
      app.auth.requireScopes(context, ["breakglass:review"]);
      app.auth.requireRoles(
        context,
        action === "revoke" ? ["admin", "approver", "breakglass_operator"] : ["admin", "approver"],
      );
      const request =
        action === "approve"
          ? await app.broker.reviewBreakGlassRequest(context, requestId, "active", parsedNote)
          : action === "deny"
            ? await app.broker.reviewBreakGlassRequest(context, requestId, "denied", parsedNote)
            : await app.broker.revokeBreakGlassRequest(context, requestId, parsedNote);

      return {
        content: [{ type: "text", text: makeText(request ?? { error: "Request not found." }) }],
        structuredContent: { request: request ?? null },
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
