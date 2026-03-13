import * as z from "zod/v4";

export const scopeTierSchema = z.enum(["read_only", "read_write", "admin"]);
export const sensitivitySchema = z.enum(["low", "moderate", "high", "critical"]);
export const credentialStatusSchema = z.enum(["active", "disabled"]);
export const bindingAdapterSchema = z.enum(["env"]);
export const authTypeSchema = z.enum(["bearer", "api_key"]);
export const operationSchema = z.enum(["http.get", "http.post"]);

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
  effect: z.enum(["allow", "deny"]),
  description: z.string().min(1),
  principals: z.array(z.string().min(1)).min(1),
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
  ]),
  action: z.string().min(1),
  outcome: z.enum(["allowed", "denied", "success", "error"]),
  principal: z.string().min(1),
  correlationId: z.string().uuid(),
  metadata: z.record(z.string(), z.unknown()),
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
});

export type CredentialRecord = z.infer<typeof credentialRecordSchema>;
export type CredentialSummary = z.infer<typeof credentialSummarySchema>;
export type CatalogFile = z.infer<typeof catalogFileSchema>;
export type PolicyRule = z.infer<typeof policyRuleSchema>;
export type PolicyFile = z.infer<typeof policyFileSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type CatalogSearchInput = z.infer<typeof catalogSearchInputSchema>;
export type AccessRequestInput = z.infer<typeof accessRequestInputSchema>;
