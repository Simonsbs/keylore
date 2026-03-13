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
  "broker:use",
  "audit:read",
  "approval:read",
  "approval:review",
  "mcp:use",
]);
export const authClientStatusSchema = z.enum(["active", "disabled"]);
export const approvalStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);

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
export type AuthContext = z.infer<typeof authContextSchema>;
export type TokenIssueInput = z.infer<typeof tokenIssueInputSchema>;
export type TokenIssueOutput = z.infer<typeof tokenIssueOutputSchema>;
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>;
