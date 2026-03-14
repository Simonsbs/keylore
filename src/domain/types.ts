import * as z from "zod/v4";

export const scopeTierSchema = z.enum(["read_only", "read_write", "admin"]);
export const sensitivitySchema = z.enum(["low", "moderate", "high", "critical"]);
export const credentialStatusSchema = z.enum(["active", "disabled"]);
export const bindingAdapterSchema = z.enum([
  "local",
  "env",
  "vault",
  "1password",
  "aws_secrets_manager",
  "gcp_secret_manager",
]);
export const authTypeSchema = z.enum(["bearer", "api_key"]);
export const operationSchema = z.enum(["http.get", "http.post"]);
export const runtimeModeSchema = z.enum(["proxy", "sandbox_injection"]);
export const principalRoleSchema = z.enum([
  "admin",
  "auth_admin",
  "operator",
  "maintenance_operator",
  "backup_operator",
  "breakglass_operator",
  "auditor",
  "approver",
  "consumer",
]);
export const accessScopeSchema = z.enum([
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
]);
export const authClientStatusSchema = z.enum(["active", "disabled"]);
export const authClientAuthMethodSchema = z.enum([
  "client_secret_basic",
  "client_secret_post",
  "private_key_jwt",
  "none",
]);
export const authGrantTypeSchema = z.enum([
  "client_credentials",
  "authorization_code",
  "refresh_token",
]);
export const tenantIdSchema = z.string().min(1).max(128);
export const tenantStatusSchema = z.enum(["active", "disabled"]);
export const approvalStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export const accessModeSchema = z.enum(["live", "dry_run", "simulation"]);
export const accessTokenStatusSchema = z.enum(["active", "revoked"]);
export const authCodeChallengeMethodSchema = z.enum(["S256"]);
export const breakGlassStatusSchema = z.enum(["pending", "active", "denied", "expired", "revoked"]);
export const reviewDecisionSchema = z.enum(["approved", "denied"]);
export const rotationRunStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
]);
export const rotationRunSourceSchema = z.enum([
  "manual",
  "catalog_expiry",
  "secret_expiry",
  "secret_rotation_window",
]);

export const publicJwkSchema = z
  .object({
    kty: z.string().min(1),
    kid: z.string().min(1).optional(),
    alg: z.string().min(1).optional(),
    use: z.string().min(1).optional(),
    n: z.string().min(1).optional(),
    e: z.string().min(1).optional(),
    crv: z.string().min(1).optional(),
    x: z.string().min(1).optional(),
    y: z.string().min(1).optional(),
  })
  .passthrough();

export const credentialBindingSchema = z.object({
  adapter: bindingAdapterSchema,
  ref: z.string().min(1),
  authType: authTypeSchema,
  headerName: z.string().min(1).default("Authorization"),
  headerPrefix: z.string().default("Bearer "),
  injectionEnvName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
});

export const credentialRecordSchema = z.object({
  id: z.string().min(1),
  tenantId: tenantIdSchema.default("default"),
  displayName: z.string().min(1),
  service: z.string().min(1),
  owner: z.string().min(1),
  scopeTier: scopeTierSchema,
  sensitivity: sensitivitySchema,
  allowedDomains: z.array(z.string().min(1)).min(1),
  permittedOperations: z.array(operationSchema).min(1),
  expiresAt: z.string().datetime().nullable(),
  rotationPolicy: z.string().min(1),
  lastValidatedAt: z.string().datetime().nullable(),
  selectionNotes: z.string().min(1),
  binding: credentialBindingSchema,
  tags: z.array(z.string().min(1)).default([]),
  status: credentialStatusSchema.default("active"),
});

export const credentialSummarySchema = credentialRecordSchema.omit({
  binding: true,
});

export const catalogFileSchema = z.object({
  version: z.number().int().positive(),
  credentials: z.array(credentialRecordSchema),
});

export const policyRuleSchema = z.object({
  id: z.string().min(1),
  tenantId: tenantIdSchema.default("default"),
  effect: z.enum(["allow", "deny", "approval"]),
  description: z.string().min(1),
  principals: z.array(z.string().min(1)).min(1),
  principalRoles: z.array(principalRoleSchema).optional(),
  credentialIds: z.array(z.string().min(1)).optional(),
  services: z.array(z.string().min(1)).optional(),
  operations: z.array(z.union([operationSchema, z.literal("*")])).min(1),
  domainPatterns: z.array(z.string().min(1)).min(1),
  environments: z.array(z.string().min(1)).optional(),
});

export const policyFileSchema = z.object({
  version: z.number().int().positive(),
  rules: z.array(policyRuleSchema),
});

export const auditEventSchema = z.object({
  eventId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  tenantId: tenantIdSchema.default("default"),
  type: z.enum([
    "catalog.search",
    "catalog.read",
    "catalog.write",
    "authz.decision",
    "credential.use",
    "approval.request",
    "approval.review",
    "breakglass.request",
    "breakglass.review",
    "breakglass.use",
    "auth.client",
    "auth.token",
    "runtime.exec",
    "adapter.health",
    "notification.delivery",
    "trace.export",
    "rotation.run",
    "system.backup",
  ]),
  action: z.string().min(1),
  outcome: z.enum(["allowed", "denied", "success", "error"]),
  principal: z.string().min(1),
  correlationId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()),
});

export const httpResultSchema = z.object({
  status: z.number().int(),
  contentType: z.string().nullable(),
  bodyPreview: z.string(),
  bodyTruncated: z.boolean(),
});

export const accessDecisionSchema = z.object({
  decision: z.enum(["allowed", "denied", "approval_required"]),
  mode: accessModeSchema,
  reason: z.string(),
  correlationId: z.string().uuid(),
  credential: credentialSummarySchema.optional(),
  ruleId: z.string().optional(),
  httpResult: httpResultSchema.optional(),
  approvalRequestId: z.string().uuid().optional(),
});

export const catalogSearchOutputSchema = z.object({
  results: z.array(credentialSummarySchema),
  count: z.number().int().min(0),
});

export const catalogGetOutputSchema = z.object({
  result: credentialSummarySchema.nullable(),
});

export const auditRecentOutputSchema = z.object({
  events: z.array(auditEventSchema),
});

export const catalogSearchInputSchema = z.object({
  query: z.string().trim().optional(),
  service: z.string().trim().optional(),
  owner: z.string().trim().optional(),
  scopeTier: scopeTierSchema.optional(),
  sensitivity: sensitivitySchema.optional(),
  status: credentialStatusSchema.optional(),
  tag: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const createCredentialInputSchema = credentialRecordSchema;

const secretLikeSelectionNotesPattern =
  /(gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AKIA[0-9A-Z]{16})/;
const vagueSelectionNotesPattern =
  /^(use when needed|general use|general purpose|for api|api token|token for api|default token|main token)$/i;

export const coreCredentialCreateInputSchema = z
  .object({
    credentialId: z.string().min(1),
    tenantId: tenantIdSchema.default("default"),
    displayName: z.string().min(1),
    service: z.string().min(1),
    owner: z.string().default("local"),
    scopeTier: scopeTierSchema.default("read_only"),
    sensitivity: sensitivitySchema.default("high"),
    allowedDomains: z.array(z.string().min(1)).min(1),
    permittedOperations: z.array(operationSchema).min(1).default(["http.get"]),
    selectionNotes: z.string().min(1),
    rotationPolicy: z.string().default("Managed locally"),
    tags: z.array(z.string().min(1)).default([]),
    status: credentialStatusSchema.default("active"),
    expiresAt: z.string().datetime().nullable().default(null),
    authType: authTypeSchema.default("bearer"),
    headerName: z.string().min(1).default("Authorization"),
    headerPrefix: z.string().default("Bearer "),
    injectionEnvName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
    secretSource: z.discriminatedUnion("adapter", [
      z.object({
        adapter: z.literal("local"),
        secretValue: z.string().min(1),
      }),
      z.object({
        adapter: z.literal("env"),
        ref: z.string().min(1),
      }),
    ]),
  })
  .superRefine((value, ctx) => {
    if (
      value.authType === "bearer" &&
      value.headerName.toLowerCase() === "authorization" &&
      !value.headerPrefix.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["headerPrefix"],
        message: "Bearer credentials should include a non-empty header prefix.",
      });
    }

    const selectionNotes = value.selectionNotes.trim();
    if (selectionNotes.length < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectionNotes"],
        message:
          "Selection notes must explain when the agent should use this credential in more detail.",
      });
    }

    if (vagueSelectionNotesPattern.test(selectionNotes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectionNotes"],
        message:
          "Selection notes are too vague. Describe the target service, intended use, and what the agent should avoid.",
      });
    }

    if (secretLikeSelectionNotesPattern.test(selectionNotes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectionNotes"],
        message: "Selection notes must not contain token-like secret material.",
      });
    }

    if (value.permittedOperations.includes("http.post") && value.scopeTier === "read_only") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scopeTier"],
        message: "Credentials that allow http.post cannot use the read_only scope tier.",
      });
    }
  });

export const coreCredentialCreateOutputSchema = z.object({
  credential: credentialSummarySchema,
});

export const updateCredentialInputSchema = credentialRecordSchema
  .omit({ id: true, tenantId: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const accessRequestInputSchema = z.object({
  credentialId: z.string().min(1),
  operation: operationSchema,
  targetUrl: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  payload: z.string().max(20_000).optional(),
  approvalId: z.string().uuid().optional(),
  breakGlassId: z.string().uuid().optional(),
  dryRun: z.boolean().optional(),
});

export const runtimeExecutionInputSchema = z.object({
  credentialId: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).max(32).default([]),
  secretEnvName: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
  env: z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/), z.string()).optional(),
  timeoutMs: z.number().int().min(100).max(60000).optional(),
});

export const runtimeExecutionResultSchema = z.object({
  mode: z.literal("sandbox_injection"),
  command: z.string(),
  args: z.array(z.string()),
  exitCode: z.number().int(),
  timedOut: z.boolean(),
  durationMs: z.number().int().min(0),
  stdoutPreview: z.string(),
  stderrPreview: z.string(),
  outputTruncated: z.boolean(),
});

export const authClientSeedSchema = z
  .object({
    clientId: z.string().min(1),
    tenantId: tenantIdSchema.default("default"),
    displayName: z.string().min(1),
    secretRef: z.string().min(1).optional(),
    tokenEndpointAuthMethod: authClientAuthMethodSchema.default("client_secret_basic"),
    grantTypes: z.array(authGrantTypeSchema).min(1).default(["client_credentials"]),
    redirectUris: z.array(z.string().url()).default([]),
    jwks: z.array(publicJwkSchema).min(1).optional(),
    roles: z.array(principalRoleSchema).min(1),
    allowedScopes: z.array(accessScopeSchema).min(1),
    status: authClientStatusSchema.default("active"),
  })
  .superRefine((value, ctx) => {
    const supportsAuthCode = value.grantTypes.includes("authorization_code");

    if (supportsAuthCode && value.redirectUris.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["redirectUris"],
        message: "authorization_code clients require at least one redirect URI.",
      });
    }

    if (value.tokenEndpointAuthMethod === "none") {
      if (!supportsAuthCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["grantTypes"],
          message: "Public clients must support authorization_code.",
        });
      }
      if (value.grantTypes.includes("client_credentials")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["grantTypes"],
          message: "Public clients cannot use client_credentials.",
        });
      }
      if (value.secretRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secretRef"],
          message: "Public clients must not define secretRef.",
        });
      }
      return;
    }

    if (value.tokenEndpointAuthMethod === "private_key_jwt") {
      if (!value.jwks?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["jwks"],
          message: "private_key_jwt clients require at least one public JWK.",
        });
      }
      if (value.secretRef) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secretRef"],
          message: "private_key_jwt clients must not define secretRef.",
        });
      }
      return;
    }

    if (!value.secretRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["secretRef"],
        message: "client_secret auth clients require secretRef.",
      });
    }
  });

export const authClientSeedFileSchema = z.object({
  version: z.number().int().positive(),
  clients: z.array(authClientSeedSchema),
});

export const authClientRecordSchema = z.object({
  clientId: z.string().min(1),
  tenantId: tenantIdSchema.default("default"),
  displayName: z.string().min(1),
  roles: z.array(principalRoleSchema).min(1),
  allowedScopes: z.array(accessScopeSchema).min(1),
  status: authClientStatusSchema,
  tokenEndpointAuthMethod: authClientAuthMethodSchema.default("client_secret_basic"),
  grantTypes: z.array(authGrantTypeSchema).min(1).default(["client_credentials"]),
  redirectUris: z.array(z.string().url()).default([]),
  jwks: z.array(publicJwkSchema).default([]),
});

export const authClientCreateInputSchema = z
  .object({
    clientId: z.string().min(1),
    tenantId: tenantIdSchema.default("default"),
    displayName: z.string().min(1),
    roles: z.array(principalRoleSchema).min(1),
    allowedScopes: z.array(accessScopeSchema).min(1),
    clientSecret: z.string().min(16).optional(),
    status: authClientStatusSchema.default("active"),
    tokenEndpointAuthMethod: authClientAuthMethodSchema.default("client_secret_basic"),
    grantTypes: z.array(authGrantTypeSchema).min(1).default(["client_credentials"]),
    redirectUris: z.array(z.string().url()).default([]),
    jwks: z.array(publicJwkSchema).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const supportsAuthCode = value.grantTypes.includes("authorization_code");

    if (supportsAuthCode && value.redirectUris.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["redirectUris"],
        message: "authorization_code clients require at least one redirect URI.",
      });
    }

    if (value.tokenEndpointAuthMethod === "none") {
      if (!supportsAuthCode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["grantTypes"],
          message: "Public clients must support authorization_code.",
        });
      }
      if (value.grantTypes.includes("client_credentials")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["grantTypes"],
          message: "Public clients cannot use client_credentials.",
        });
      }
      if (value.clientSecret) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clientSecret"],
          message: "Public clients do not use shared secrets.",
        });
      }
      if (value.jwks?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["jwks"],
          message: "Public clients do not use client assertion keys.",
        });
      }
      return;
    }

    if (value.tokenEndpointAuthMethod !== "private_key_jwt") {
      return;
    }

    if (!value.jwks?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["jwks"],
        message: "private_key_jwt clients require at least one public JWK.",
      });
    }

    if (value.clientSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["clientSecret"],
        message: "private_key_jwt clients do not use shared secrets.",
      });
    }
  });

export const authClientUpdateInputSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    roles: z.array(principalRoleSchema).min(1).optional(),
    allowedScopes: z.array(accessScopeSchema).min(1).optional(),
    status: authClientStatusSchema.optional(),
    tokenEndpointAuthMethod: authClientAuthMethodSchema.optional(),
    grantTypes: z.array(authGrantTypeSchema).min(1).optional(),
    redirectUris: z.array(z.string().url()).min(1).optional(),
    jwks: z.array(publicJwkSchema).min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const authClientRotateSecretInputSchema = z.object({
  clientSecret: z.string().min(16).optional(),
});

export const authClientSecretOutputSchema = z.object({
  client: authClientRecordSchema,
  clientSecret: z.string().min(16).optional(),
});

export const tokenIssueInputSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1).optional(),
  grantType: authGrantTypeSchema,
  scope: z.array(accessScopeSchema).optional(),
  resource: z.string().url().optional(),
  code: z.string().min(1).optional(),
  codeVerifier: z.string().min(43).max(128).optional(),
  redirectUri: z.string().url().optional(),
  refreshToken: z.string().min(1).optional(),
  clientAssertionType: z
    .literal("urn:ietf:params:oauth:client-assertion-type:jwt-bearer")
    .optional(),
  clientAssertion: z.string().min(1).optional(),
}).superRefine((value, ctx) => {
  if (value.grantType === "authorization_code") {
    if (!value.code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["code"],
        message: "authorization_code requires code.",
      });
    }
    if (!value.codeVerifier) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["codeVerifier"],
        message: "authorization_code requires codeVerifier.",
      });
    }
    if (!value.redirectUri) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["redirectUri"],
        message: "authorization_code requires redirectUri.",
      });
    }
  }

  if (value.grantType === "refresh_token" && !value.refreshToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["refreshToken"],
      message: "refresh_token requires refreshToken.",
    });
  }
});

export const tokenIssueOutputSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
});

export const authContextSchema = z.object({
  principal: z.string().min(1),
  clientId: z.string().min(1),
  tenantId: tenantIdSchema.optional(),
  roles: z.array(principalRoleSchema).min(1),
  scopes: z.array(accessScopeSchema).min(1),
  resource: z.string().url().optional(),
});

export const approvalRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: tenantIdSchema.default("default"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: approvalStatusSchema,
  requestedBy: z.string().min(1),
  requestedRoles: z.array(principalRoleSchema).min(1),
  credentialId: z.string().min(1),
  operation: operationSchema,
  targetUrl: z.string().url(),
  targetHost: z.string().min(1),
  reason: z.string().min(1),
  ruleId: z.string().optional(),
  correlationId: z.string().uuid(),
  fingerprint: z.string().min(1),
  requiredApprovals: z.number().int().min(1),
  approvalCount: z.number().int().min(0),
  denialCount: z.number().int().min(0),
  reviews: z.array(
    z.object({
      reviewId: z.string().uuid(),
      reviewedAt: z.string().datetime(),
      reviewedBy: z.string().min(1),
      decision: reviewDecisionSchema,
      note: z.string().max(1000).optional(),
    }),
  ).default([]),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  reviewNote: z.string().optional(),
});

export const approvalReviewInputSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const approvalListOutputSchema = z.object({
  approvals: z.array(approvalRequestSchema),
});

export const breakGlassRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: tenantIdSchema.default("default"),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  status: breakGlassStatusSchema,
  requestedBy: z.string().min(1),
  requestedRoles: z.array(principalRoleSchema).min(1),
  credentialId: z.string().min(1),
  operation: operationSchema,
  targetUrl: z.string().url(),
  targetHost: z.string().min(1),
  justification: z.string().min(12).max(2000),
  requestedDurationSeconds: z.number().int().min(60),
  correlationId: z.string().uuid(),
  fingerprint: z.string().min(1),
  requiredApprovals: z.number().int().min(1),
  approvalCount: z.number().int().min(0),
  denialCount: z.number().int().min(0),
  reviews: z.array(
    z.object({
      reviewId: z.string().uuid(),
      reviewedAt: z.string().datetime(),
      reviewedBy: z.string().min(1),
      decision: reviewDecisionSchema,
      note: z.string().max(1000).optional(),
    }),
  ).default([]),
  reviewedBy: z.string().optional(),
  reviewedAt: z.string().datetime().optional(),
  reviewNote: z.string().max(1000).optional(),
  revokedBy: z.string().optional(),
  revokedAt: z.string().datetime().optional(),
  revokeNote: z.string().max(1000).optional(),
});

export const breakGlassRequestInputSchema = z.object({
  credentialId: z.string().min(1),
  operation: operationSchema,
  targetUrl: z.string().url(),
  justification: z.string().min(12).max(2000),
  requestedDurationSeconds: z.number().int().min(60).max(86400).optional(),
});

export const breakGlassReviewInputSchema = z.object({
  note: z.string().max(1000).optional(),
});

export const breakGlassListOutputSchema = z.object({
  requests: z.array(breakGlassRequestSchema),
});

export const authClientListOutputSchema = z.object({
  clients: z.array(authClientRecordSchema),
});

export const accessTokenRecordSchema = z.object({
  tokenId: z.string().uuid(),
  clientId: z.string().min(1),
  tenantId: tenantIdSchema.default("default"),
  subject: z.string().min(1),
  scopes: z.array(accessScopeSchema).min(1),
  roles: z.array(principalRoleSchema).min(1),
  resource: z.string().url().optional(),
  expiresAt: z.string().datetime(),
  status: accessTokenStatusSchema,
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
});

export const accessTokenListOutputSchema = z.object({
  tokens: z.array(accessTokenRecordSchema),
});

export const accessTokenRevokeOutputSchema = z.object({
  token: accessTokenRecordSchema.nullable(),
});

export const refreshTokenRecordSchema = z.object({
  refreshTokenId: z.string().uuid(),
  clientId: z.string().min(1),
  tenantId: tenantIdSchema.default("default"),
  subject: z.string().min(1),
  scopes: z.array(accessScopeSchema).min(1),
  roles: z.array(principalRoleSchema).min(1),
  resource: z.string().url().optional(),
  expiresAt: z.string().datetime(),
  status: accessTokenStatusSchema,
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
});

export const refreshTokenListOutputSchema = z.object({
  tokens: z.array(refreshTokenRecordSchema),
});

export const refreshTokenRevokeOutputSchema = z.object({
  token: refreshTokenRecordSchema.nullable(),
});

export const authTokenListQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
  status: accessTokenStatusSchema.optional(),
});

export const authorizationRequestInputSchema = z.object({
  clientId: z.string().min(1),
  redirectUri: z.string().url(),
  scope: z.array(accessScopeSchema).optional(),
  resource: z.string().url().optional(),
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: authCodeChallengeMethodSchema.default("S256"),
  state: z.string().max(512).optional(),
});

export const authorizationRequestOutputSchema = z.object({
  code: z.string().min(1),
  clientId: z.string().min(1),
  tenantId: tenantIdSchema,
  subject: z.string().min(1),
  redirectUri: z.string().url(),
  expiresIn: z.number().int().positive(),
  scope: z.string().min(1),
  state: z.string().max(512).optional(),
});

export const tenantRecordSchema = z.object({
  tenantId: tenantIdSchema,
  displayName: z.string().min(1),
  description: z.string().max(2000).optional(),
  status: tenantStatusSchema.default("active"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const tenantCreateInputSchema = z.object({
  tenantId: tenantIdSchema,
  displayName: z.string().min(1),
  description: z.string().max(2000).optional(),
  status: tenantStatusSchema.default("active"),
});

export const tenantUpdateInputSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    description: z.string().max(2000).optional(),
    status: tenantStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const tenantSummarySchema = tenantRecordSchema.extend({
  credentialCount: z.number().int().min(0),
  authClientCount: z.number().int().min(0),
  activeTokenCount: z.number().int().min(0),
});

export const tenantListOutputSchema = z.object({
  tenants: z.array(tenantSummarySchema),
});

export const tenantGetOutputSchema = z.object({
  tenant: tenantSummarySchema.nullable(),
});

export const tenantBootstrapClientInputSchema = z
  .object({
    clientId: z.string().min(1),
    displayName: z.string().min(1),
    roles: z.array(principalRoleSchema).min(1),
    allowedScopes: z.array(accessScopeSchema).min(1),
    clientSecret: z.string().min(16).optional(),
    status: authClientStatusSchema.default("active"),
    tokenEndpointAuthMethod: authClientAuthMethodSchema.default("client_secret_basic"),
    grantTypes: z.array(authGrantTypeSchema).min(1).default(["client_credentials"]),
    redirectUris: z.array(z.string().url()).default([]),
    jwks: z.array(publicJwkSchema).min(1).optional(),
  })
  .superRefine((value, ctx) => {
    authClientCreateInputSchema.safeParse({
      ...value,
      tenantId: "default",
    }).error?.issues.forEach((issue) => {
      ctx.addIssue({
        ...issue,
        path: issue.path.filter((segment) => segment !== "tenantId"),
      });
    });
  });

export const tenantBootstrapInputSchema = z.object({
  tenant: tenantCreateInputSchema,
  authClients: z.array(tenantBootstrapClientInputSchema).default([]),
});

export const tenantBootstrapOutputSchema = z.object({
  tenant: tenantSummarySchema,
  clients: z.array(authClientSecretOutputSchema),
});

export const secretInspectionSchema = z.object({
  adapter: bindingAdapterSchema,
  ref: z.string().min(1),
  status: z.enum(["ok", "warning", "error"]),
  resolved: z.boolean(),
  version: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  nextRotationAt: z.string().datetime().optional(),
  state: z.string().optional(),
  rotationEnabled: z.boolean().optional(),
  notes: z.array(z.string()).default([]),
  error: z.string().optional(),
});

export const credentialStatusReportSchema = z.object({
  credential: credentialSummarySchema,
  runtimeMode: runtimeModeSchema,
  catalogExpiresAt: z.string().datetime().nullable(),
  daysUntilCatalogExpiry: z.number().int().nullable(),
  inspection: secretInspectionSchema,
});

export const credentialStatusReportListOutputSchema = z.object({
  reports: z.array(credentialStatusReportSchema),
});

export const adapterHealthSchema = z.object({
  adapter: bindingAdapterSchema,
  available: z.boolean(),
  status: z.enum(["ok", "warning", "error"]),
  details: z.string(),
});

export const adapterHealthListOutputSchema = z.object({
  adapters: z.array(adapterHealthSchema),
});

export const maintenanceTaskResultSchema = z.object({
  approvalsExpired: z.number().int().min(0),
  breakGlassExpired: z.number().int().min(0),
  accessTokensExpired: z.number().int().min(0),
  refreshTokensExpired: z.number().int().min(0),
  rateLimitBucketsDeleted: z.number().int().min(0),
  authorizationCodesExpired: z.number().int().min(0),
  oauthClientAssertionsExpired: z.number().int().min(0),
});

export const maintenanceStatusSchema = z.object({
  enabled: z.boolean(),
  intervalMs: z.number().int().min(0),
  running: z.boolean(),
  lastRunAt: z.string().datetime().optional(),
  lastSuccessAt: z.string().datetime().optional(),
  lastDurationMs: z.number().int().min(0).optional(),
  consecutiveFailures: z.number().int().min(0),
  lastError: z.string().optional(),
  lastResult: maintenanceTaskResultSchema.optional(),
});

export const maintenanceStatusOutputSchema = z.object({
  maintenance: maintenanceStatusSchema,
});

export const traceSpanSchema = z.object({
  spanId: z.string().uuid(),
  traceId: z.string().min(1).max(128),
  parentSpanId: z.string().uuid().optional(),
  name: z.string().min(1),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationMs: z.number().int().min(0),
  status: z.enum(["ok", "error"]),
  attributes: z.record(z.string(), z.unknown()),
});

export const traceListOutputSchema = z.object({
  traceId: z.string().min(1).max(128).optional(),
  traces: z.array(traceSpanSchema),
});

export const traceExportStatusSchema = z.object({
  enabled: z.boolean(),
  endpoint: z.string().url().optional(),
  pendingSpans: z.number().int().min(0),
  lastFlushAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
  consecutiveFailures: z.number().int().min(0),
  lastBatchSize: z.number().int().min(0).optional(),
  running: z.boolean(),
});

export const traceExportStatusOutputSchema = z.object({
  exporter: traceExportStatusSchema,
});

export const rotationRunSchema = z.object({
  id: z.string().uuid(),
  tenantId: tenantIdSchema.default("default"),
  credentialId: z.string().min(1),
  status: rotationRunStatusSchema,
  source: rotationRunSourceSchema,
  reason: z.string().min(1),
  dueAt: z.string().datetime().optional(),
  plannedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  plannedBy: z.string().min(1),
  updatedBy: z.string().min(1),
  note: z.string().max(2000).optional(),
  targetRef: z.string().min(1).optional(),
  resultNote: z.string().max(2000).optional(),
});

export const rotationRunListOutputSchema = z.object({
  rotations: z.array(rotationRunSchema),
});

export const rotationPlanInputSchema = z.object({
  horizonDays: z.number().int().min(1).max(365).default(14),
  credentialIds: z.array(z.string().min(1)).max(100).optional(),
});

export const rotationCreateInputSchema = z.object({
  credentialId: z.string().min(1),
  reason: z.string().min(8).max(2000),
  dueAt: z.string().datetime().optional(),
  note: z.string().max(2000).optional(),
});

export const rotationTransitionInputSchema = z.object({
  note: z.string().max(2000).optional(),
});

export const rotationCompleteInputSchema = z.object({
  note: z.string().max(2000).optional(),
  targetRef: z.string().min(1).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  lastValidatedAt: z.string().datetime().optional(),
});

export const backupSummarySchema = z.object({
  format: z.literal("keylore-logical-backup"),
  version: z.number().int().positive(),
  sourceVersion: z.string().min(1),
  createdAt: z.string().datetime(),
  tenants: z.number().int().min(0),
  credentials: z.number().int().min(0),
  authClients: z.number().int().min(0),
  accessTokens: z.number().int().min(0),
  refreshTokens: z.number().int().min(0),
  approvals: z.number().int().min(0),
  breakGlassRequests: z.number().int().min(0),
  rotationRuns: z.number().int().min(0),
  auditEvents: z.number().int().min(0),
});

export const backupInspectOutputSchema = z.object({
  backup: backupSummarySchema,
});

export type CredentialRecord = z.infer<typeof credentialRecordSchema>;
export type CredentialSummary = z.infer<typeof credentialSummarySchema>;
export type CatalogFile = z.infer<typeof catalogFileSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type PolicyFile = z.infer<typeof policyFileSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type CatalogSearchInput = z.infer<typeof catalogSearchInputSchema>;
export type CoreCredentialCreateInput = z.infer<typeof coreCredentialCreateInputSchema>;
export type AccessRequestInput = z.infer<typeof accessRequestInputSchema>;
export type AccessDecision = z.infer<typeof accessDecisionSchema>;
export type PrincipalRole = z.infer<typeof principalRoleSchema>;
export type AccessScope = z.infer<typeof accessScopeSchema>;
export type AuthClientAuthMethod = z.infer<typeof authClientAuthMethodSchema>;
export type AuthGrantType = z.infer<typeof authGrantTypeSchema>;
export type AuthClientSeed = z.infer<typeof authClientSeedSchema>;
export type AuthClientSeedFile = z.infer<typeof authClientSeedFileSchema>;
export type AuthClientRecord = z.infer<typeof authClientRecordSchema>;
export type AuthClientCreateInput = z.infer<typeof authClientCreateInputSchema>;
export type AuthClientUpdateInput = z.infer<typeof authClientUpdateInputSchema>;
export type AuthContext = z.infer<typeof authContextSchema>;
export type TokenIssueInput = z.infer<typeof tokenIssueInputSchema>;
export type TokenIssueOutput = z.infer<typeof tokenIssueOutputSchema>;
export type TenantRecord = z.infer<typeof tenantRecordSchema>;
export type TenantCreateInput = z.infer<typeof tenantCreateInputSchema>;
export type TenantUpdateInput = z.infer<typeof tenantUpdateInputSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type BreakGlassRequest = z.infer<typeof breakGlassRequestSchema>;
export type AccessMode = z.infer<typeof accessModeSchema>;
export type AccessTokenRecord = z.infer<typeof accessTokenRecordSchema>;
export type RefreshTokenRecord = z.infer<typeof refreshTokenRecordSchema>;
export type RuntimeMode = z.infer<typeof runtimeModeSchema>;
export type RuntimeExecutionInput = z.infer<typeof runtimeExecutionInputSchema>;
export type RuntimeExecutionResult = z.infer<typeof runtimeExecutionResultSchema>;
export type SecretInspection = z.infer<typeof secretInspectionSchema>;
export type CredentialStatusReport = z.infer<typeof credentialStatusReportSchema>;
export type AdapterHealth = z.infer<typeof adapterHealthSchema>;
export type MaintenanceTaskResult = z.infer<typeof maintenanceTaskResultSchema>;
export type MaintenanceStatus = z.infer<typeof maintenanceStatusSchema>;
export type BackupSummary = z.infer<typeof backupSummarySchema>;
export type TraceSpan = z.infer<typeof traceSpanSchema>;
export type TraceExportStatus = z.infer<typeof traceExportStatusSchema>;
export type RotationRun = z.infer<typeof rotationRunSchema>;
