import * as z from "zod/v4";

export const scopeTierSchema = z.enum(["read_only", "read_write", "admin"]);
export const sensitivitySchema = z.enum(["low", "moderate", "high", "critical"]);
export const credentialStatusSchema = z.enum(["active", "disabled"]);
export const bindingAdapterSchema = z.enum(["env"]);
export const authTypeSchema = z.enum(["bearer", "api_key"]);
export const operationSchema = z.enum(["http.get", "http.post"]);
export const principalRoleSchema = z.enum([
  "admin",
  "operator",
  "auditor",
  "approver",
  "consumer",
]);
export const accessScopeSchema = z.enum([
  "catalog:read",
  "catalog:write",
  "admin:read",
  "admin:write",
  "broker:use",
  "audit:read",
  "approval:read",
  "approval:review",
  "mcp:use",
]);
export const authClientStatusSchema = z.enum(["active", "disabled"]);
export const approvalStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export const accessModeSchema = z.enum(["live", "dry_run", "simulation"]);
export const accessTokenStatusSchema = z.enum(["active", "revoked"]);

export const credentialBindingSchema = z.object({
  adapter: bindingAdapterSchema,
  ref: z.string().min(1),
  authType: authTypeSchema,
  headerName: z.string().min(1).default("Authorization"),
  headerPrefix: z.string().default("Bearer "),
});

export const credentialRecordSchema = z.object({
  id: z.string().min(1),
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
  type: z.enum([
    "catalog.search",
    "catalog.read",
    "catalog.write",
    "authz.decision",
    "credential.use",
    "approval.request",
    "approval.review",
    "auth.client",
    "auth.token",
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

export const updateCredentialInputSchema = credentialRecordSchema
  .omit({ id: true })
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
  dryRun: z.boolean().optional(),
});

export const authClientSeedSchema = z.object({
  clientId: z.string().min(1),
  displayName: z.string().min(1),
  secretRef: z.string().min(1),
  roles: z.array(principalRoleSchema).min(1),
  allowedScopes: z.array(accessScopeSchema).min(1),
  status: authClientStatusSchema.default("active"),
});

export const authClientSeedFileSchema = z.object({
  version: z.number().int().positive(),
  clients: z.array(authClientSeedSchema),
});

export const authClientRecordSchema = z.object({
  clientId: z.string().min(1),
  displayName: z.string().min(1),
  roles: z.array(principalRoleSchema).min(1),
  allowedScopes: z.array(accessScopeSchema).min(1),
  status: authClientStatusSchema,
});

export const authClientCreateInputSchema = z.object({
  clientId: z.string().min(1),
  displayName: z.string().min(1),
  roles: z.array(principalRoleSchema).min(1),
  allowedScopes: z.array(accessScopeSchema).min(1),
  clientSecret: z.string().min(16).optional(),
  status: authClientStatusSchema.default("active"),
});

export const authClientUpdateInputSchema = z
  .object({
    displayName: z.string().min(1).optional(),
    roles: z.array(principalRoleSchema).min(1).optional(),
    allowedScopes: z.array(accessScopeSchema).min(1).optional(),
    status: authClientStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided.",
  });

export const authClientRotateSecretInputSchema = z.object({
  clientSecret: z.string().min(16).optional(),
});

export const authClientSecretOutputSchema = z.object({
  client: authClientRecordSchema,
  clientSecret: z.string().min(16),
});

export const tokenIssueInputSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  grantType: z.literal("client_credentials"),
  scope: z.array(accessScopeSchema).optional(),
  resource: z.string().url().optional(),
});

export const tokenIssueOutputSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().min(1),
});

export const authContextSchema = z.object({
  principal: z.string().min(1),
  clientId: z.string().min(1),
  roles: z.array(principalRoleSchema).min(1),
  scopes: z.array(accessScopeSchema).min(1),
  resource: z.string().url().optional(),
});

export const approvalRequestSchema = z.object({
  id: z.string().uuid(),
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

export const authClientListOutputSchema = z.object({
  clients: z.array(authClientRecordSchema),
});

export const accessTokenRecordSchema = z.object({
  tokenId: z.string().uuid(),
  clientId: z.string().min(1),
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

export const authTokenListQuerySchema = z.object({
  clientId: z.string().min(1).optional(),
  status: accessTokenStatusSchema.optional(),
});

export type CredentialRecord = z.infer<typeof credentialRecordSchema>;
export type CredentialSummary = z.infer<typeof credentialSummarySchema>;
export type CatalogFile = z.infer<typeof catalogFileSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type PolicyFile = z.infer<typeof policyFileSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type CatalogSearchInput = z.infer<typeof catalogSearchInputSchema>;
export type AccessRequestInput = z.infer<typeof accessRequestInputSchema>;
export type AccessDecision = z.infer<typeof accessDecisionSchema>;
export type PrincipalRole = z.infer<typeof principalRoleSchema>;
export type AccessScope = z.infer<typeof accessScopeSchema>;
export type AuthClientSeed = z.infer<typeof authClientSeedSchema>;
export type AuthClientSeedFile = z.infer<typeof authClientSeedFileSchema>;
export type AuthClientRecord = z.infer<typeof authClientRecordSchema>;
export type AuthClientCreateInput = z.infer<typeof authClientCreateInputSchema>;
export type AuthClientUpdateInput = z.infer<typeof authClientUpdateInputSchema>;
export type AuthContext = z.infer<typeof authContextSchema>;
export type TokenIssueInput = z.infer<typeof tokenIssueInputSchema>;
export type TokenIssueOutput = z.infer<typeof tokenIssueOutputSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
export type AccessMode = z.infer<typeof accessModeSchema>;
export type AccessTokenRecord = z.infer<typeof accessTokenRecordSchema>;
