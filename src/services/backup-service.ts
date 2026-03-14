import fs from "node:fs/promises";

import * as z from "zod/v4";

import {
  accessTokenRecordSchema,
  approvalRequestSchema,
  auditEventSchema,
  authClientRecordSchema,
  AuthContext,
  backupSummarySchema,
  BreakGlassRequest,
  breakGlassRequestSchema,
  credentialRecordSchema,
  policyFileSchema,
  refreshTokenRecordSchema,
  rotationRunSchema,
  tenantRecordSchema,
} from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { StoredAuthClient } from "../repositories/interfaces.js";
import { SqlDatabase } from "../storage/database.js";

const storedAuthClientSchema = authClientRecordSchema.extend({
  secretHash: z.string().min(1).optional(),
  secretSalt: z.string().min(1).optional(),
});

const backupEnvelopeSchema = z.object({
  format: z.literal("keylore-logical-backup"),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  sourceVersion: z.string().min(1),
  tenants: z.array(tenantRecordSchema),
  credentials: z.array(credentialRecordSchema),
  policies: policyFileSchema,
  authClients: z.array(storedAuthClientSchema),
  accessTokens: z.array(accessTokenRecordSchema.extend({ tokenHash: z.string().min(1) })),
  refreshTokens: z.array(refreshTokenRecordSchema.extend({ tokenHash: z.string().min(1) })),
  approvals: z.array(approvalRequestSchema),
  breakGlassRequests: z.array(breakGlassRequestSchema),
  rotationRuns: z.array(rotationRunSchema).default([]),
  auditEvents: z.array(auditEventSchema),
});

interface BackupCredentialRow {
  id: string;
  tenant_id: string;
  display_name: string;
  service: string;
  owner: string;
  scope_tier: string;
  sensitivity: string;
  allowed_domains: string[];
  permitted_operations: string[];
  expires_at: string | Date | null;
  rotation_policy: string;
  last_validated_at: string | Date | null;
  selection_notes: string;
  binding: unknown;
  tags: string[];
  status: string;
}

interface BackupPolicyRow {
  id: string;
  tenant_id: string;
  effect: "allow" | "deny" | "approval";
  description: string;
  principals: string[];
  principal_roles: string[] | null;
  credential_ids: string[] | null;
  services: string[] | null;
  operations: string[];
  domain_patterns: string[];
  environments: string[] | null;
}

interface BackupAuthClientRow {
  client_id: string;
  tenant_id: string;
  display_name: string;
  secret_hash: string | null;
  secret_salt: string | null;
  roles: string[];
  allowed_scopes: string[];
  status: "active" | "disabled";
  token_endpoint_auth_method: string;
  grant_types: string[];
  redirect_uris: string[];
  jwks: unknown;
}

interface BackupTenantRow {
  tenant_id: string;
  display_name: string;
  description: string | null;
  status: "active" | "disabled";
  created_at: string | Date;
  updated_at: string | Date;
}

interface BackupAccessTokenRow {
  token_id: string;
  token_hash: string;
  client_id: string;
  tenant_id: string;
  subject: string;
  scopes: string[];
  roles: string[];
  resource: string | null;
  expires_at: string | Date;
  status: "active" | "revoked";
  created_at: string | Date;
  last_used_at: string | Date | null;
}

interface BackupRefreshTokenRow {
  refresh_token_id: string;
  token_hash: string;
  client_id: string;
  tenant_id: string;
  subject: string;
  scopes: string[];
  roles: string[];
  resource: string | null;
  expires_at: string | Date;
  status: "active" | "revoked";
  created_at: string | Date;
  last_used_at: string | Date | null;
}

interface BackupApprovalRow {
  id: string;
  tenant_id: string;
  created_at: string | Date;
  expires_at: string | Date;
  status: "pending" | "approved" | "denied" | "expired";
  requested_by: string;
  requested_roles: string[];
  credential_id: string;
  operation: "http.get" | "http.post";
  target_url: string;
  target_host: string;
  reason: string;
  rule_id: string | null;
  correlation_id: string;
  fingerprint: string;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  required_approvals: number;
  approval_count: number;
  denial_count: number;
  reviews: unknown;
}

interface BackupAuditRow {
  event_id: string;
  occurred_at: string | Date;
  tenant_id: string;
  type: string;
  action: string;
  outcome: "allowed" | "denied" | "success" | "error";
  principal: string;
  correlation_id: string;
  metadata: Record<string, unknown>;
}

interface BackupRotationRunRow {
  id: string;
  tenant_id: string;
  credential_id: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  source: "manual" | "catalog_expiry" | "secret_expiry" | "secret_rotation_window";
  reason: string;
  due_at: string | Date | null;
  planned_at: string | Date;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  planned_by: string;
  updated_by: string;
  note: string | null;
  target_ref: string | null;
  result_note: string | null;
}

interface BackupBreakGlassRow {
  id: string;
  tenant_id: string;
  created_at: string | Date;
  expires_at: string | Date;
  status: BreakGlassRequest["status"];
  requested_by: string;
  requested_roles: string[];
  credential_id: string;
  operation: "http.get" | "http.post";
  target_url: string;
  target_host: string;
  justification: string;
  requested_duration_seconds: number;
  correlation_id: string;
  fingerprint: string;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  review_note: string | null;
  required_approvals: number;
  approval_count: number;
  denial_count: number;
  reviews: unknown;
  revoked_by: string | null;
  revoked_at: string | Date | null;
  revoke_note: string | null;
}

function toIso(value: string | Date | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeJwks(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value as Array<Record<string, unknown>>;
  }
  if (value && typeof value === "object" && "kty" in value) {
    return [value as Record<string, unknown>];
  }
  return [];
}

function tenantOnly<T extends { tenantId: string }>(records: T[], tenantId?: string): T[] {
  return tenantId ? records.filter((record) => record.tenantId === tenantId) : records;
}

export type KeyLoreBackup = z.infer<typeof backupEnvelopeSchema>;

export class BackupService {
  public constructor(
    private readonly database: SqlDatabase,
    private readonly sourceVersion: string,
    private readonly audit: PgAuditLogService,
  ) {}

  public summarizeBackup(backup: KeyLoreBackup) {
    return backupSummarySchema.parse({
      format: backup.format,
      version: backup.version,
      sourceVersion: backup.sourceVersion,
      createdAt: backup.createdAt,
      tenants: backup.tenants.length,
      credentials: backup.credentials.length,
      authClients: backup.authClients.length,
      accessTokens: backup.accessTokens.length,
      refreshTokens: backup.refreshTokens.length,
      approvals: backup.approvals.length,
      breakGlassRequests: backup.breakGlassRequests.length,
      rotationRuns: backup.rotationRuns.length,
      auditEvents: backup.auditEvents.length,
    });
  }

  public parseBackupPayload(payload: unknown): KeyLoreBackup {
    return backupEnvelopeSchema.parse(payload);
  }

  private filterBackupForTenant(backup: KeyLoreBackup, tenantId?: string): KeyLoreBackup {
    if (!tenantId) {
      return backup;
    }

    return backupEnvelopeSchema.parse({
      ...backup,
      tenants: tenantOnly(backup.tenants, tenantId),
      credentials: tenantOnly(backup.credentials, tenantId),
      policies: {
        ...backup.policies,
        rules: tenantOnly(backup.policies.rules, tenantId),
      },
      authClients: tenantOnly(backup.authClients, tenantId),
      accessTokens: tenantOnly(backup.accessTokens, tenantId),
      refreshTokens: tenantOnly(backup.refreshTokens, tenantId),
      approvals: tenantOnly(backup.approvals, tenantId),
      breakGlassRequests: tenantOnly(backup.breakGlassRequests, tenantId),
      rotationRuns: tenantOnly(backup.rotationRuns, tenantId),
      auditEvents: tenantOnly(backup.auditEvents, tenantId),
    });
  }

  private assertTenantScopedBackup(backup: KeyLoreBackup, tenantId: string): void {
    if (!backup.tenants.some((tenant) => tenant.tenantId === tenantId)) {
      throw new Error(`Tenant-scoped restore payload is missing tenant metadata: ${tenantId}`);
    }

    const mismatchedTenants = new Set<string>();
    const collect = (records: Array<{ tenantId: string }>) => {
      for (const record of records) {
        if (record.tenantId !== tenantId) {
          mismatchedTenants.add(record.tenantId);
        }
      }
    };

    collect(backup.tenants);
    collect(backup.credentials);
    collect(backup.policies.rules);
    collect(backup.authClients);
    collect(backup.accessTokens);
    collect(backup.refreshTokens);
    collect(backup.approvals);
    collect(backup.breakGlassRequests);
    collect(backup.rotationRuns);
    collect(backup.auditEvents);

    if (mismatchedTenants.size > 0) {
      throw new Error(
        `Tenant-scoped restore payload includes foreign tenant data: ${Array.from(mismatchedTenants).sort().join(", ")}`,
      );
    }
  }

  public async exportBackup(actor?: AuthContext): Promise<KeyLoreBackup> {
    const [tenants, credentials, policies, authClients, accessTokens, refreshTokens, approvals, breakGlassRequests, rotationRuns, auditEvents] = await Promise.all([
      this.database.query<BackupTenantRow>("SELECT * FROM tenants ORDER BY tenant_id"),
      this.database.query<BackupCredentialRow>("SELECT * FROM credentials ORDER BY id"),
      this.database.query<BackupPolicyRow>("SELECT * FROM policy_rules ORDER BY id"),
      this.database.query<BackupAuthClientRow>("SELECT * FROM oauth_clients ORDER BY client_id"),
      this.database.query<BackupAccessTokenRow>("SELECT * FROM access_tokens ORDER BY created_at"),
      this.database.query<BackupRefreshTokenRow>("SELECT * FROM refresh_tokens ORDER BY created_at"),
      this.database.query<BackupApprovalRow>("SELECT * FROM approval_requests ORDER BY created_at"),
      this.database.query<BackupBreakGlassRow>("SELECT * FROM break_glass_requests ORDER BY created_at"),
      this.database.query<BackupRotationRunRow>("SELECT * FROM rotation_runs ORDER BY planned_at"),
      this.database.query<BackupAuditRow>("SELECT * FROM audit_events ORDER BY occurred_at"),
    ]);

    const fullBackup = backupEnvelopeSchema.parse({
      format: "keylore-logical-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      sourceVersion: this.sourceVersion,
      tenants: tenants.rows.map((row) => ({
        tenantId: row.tenant_id,
        displayName: row.display_name,
        description: row.description ?? undefined,
        status: row.status,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
      credentials: credentials.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        displayName: row.display_name,
        service: row.service,
        owner: row.owner,
        scopeTier: row.scope_tier,
        sensitivity: row.sensitivity,
        allowedDomains: row.allowed_domains,
        permittedOperations: row.permitted_operations,
        expiresAt: toIso(row.expires_at),
        rotationPolicy: row.rotation_policy,
        lastValidatedAt: toIso(row.last_validated_at),
        selectionNotes: row.selection_notes,
        binding: row.binding,
        tags: row.tags,
        status: row.status,
      })),
      policies: {
        version: 1,
        rules: policies.rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          effect: row.effect,
          description: row.description,
          principals: row.principals,
          principalRoles: row.principal_roles ?? undefined,
          credentialIds: row.credential_ids ?? undefined,
          services: row.services ?? undefined,
          operations: row.operations,
          domainPatterns: row.domain_patterns,
          environments: row.environments ?? undefined,
        })),
      },
      authClients: authClients.rows.map((row) => storedAuthClientSchema.parse({
        clientId: row.client_id,
        tenantId: row.tenant_id,
        displayName: row.display_name,
        roles: row.roles,
        allowedScopes: row.allowed_scopes,
        status: row.status,
        tokenEndpointAuthMethod: row.token_endpoint_auth_method,
        grantTypes: row.grant_types,
        redirectUris: row.redirect_uris,
        jwks: normalizeJwks(row.jwks),
        secretHash: row.secret_hash ?? undefined,
        secretSalt: row.secret_salt ?? undefined,
      })),
      accessTokens: accessTokens.rows.map((row) => ({
        tokenId: row.token_id,
        tokenHash: row.token_hash,
        clientId: row.client_id,
        tenantId: row.tenant_id,
        subject: row.subject,
        scopes: row.scopes,
        roles: row.roles,
        resource: row.resource ?? undefined,
        expiresAt: toIso(row.expires_at),
        status: row.status,
        createdAt: toIso(row.created_at),
        lastUsedAt: toIso(row.last_used_at) ?? undefined,
      })),
      refreshTokens: refreshTokens.rows.map((row) => ({
        refreshTokenId: row.refresh_token_id,
        tokenHash: row.token_hash,
        clientId: row.client_id,
        tenantId: row.tenant_id,
        subject: row.subject,
        scopes: row.scopes,
        roles: row.roles,
        resource: row.resource ?? undefined,
        expiresAt: toIso(row.expires_at),
        status: row.status,
        createdAt: toIso(row.created_at),
        lastUsedAt: toIso(row.last_used_at) ?? undefined,
      })),
      approvals: approvals.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        createdAt: toIso(row.created_at),
        expiresAt: toIso(row.expires_at),
        status: row.status,
        requestedBy: row.requested_by,
        requestedRoles: row.requested_roles,
        credentialId: row.credential_id,
        operation: row.operation,
        targetUrl: row.target_url,
        targetHost: row.target_host,
        reason: row.reason,
        ruleId: row.rule_id ?? undefined,
        correlationId: row.correlation_id,
        fingerprint: row.fingerprint,
        reviewedBy: row.reviewed_by ?? undefined,
        reviewedAt: toIso(row.reviewed_at) ?? undefined,
        reviewNote: row.review_note ?? undefined,
        requiredApprovals: row.required_approvals,
        approvalCount: row.approval_count,
        denialCount: row.denial_count,
        reviews: row.reviews,
      })),
      breakGlassRequests: breakGlassRequests.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        createdAt: toIso(row.created_at),
        expiresAt: toIso(row.expires_at),
        status: row.status,
        requestedBy: row.requested_by,
        requestedRoles: row.requested_roles,
        credentialId: row.credential_id,
        operation: row.operation,
        targetUrl: row.target_url,
        targetHost: row.target_host,
        justification: row.justification,
        requestedDurationSeconds: row.requested_duration_seconds,
        correlationId: row.correlation_id,
        fingerprint: row.fingerprint,
        reviewedBy: row.reviewed_by ?? undefined,
        reviewedAt: toIso(row.reviewed_at) ?? undefined,
        reviewNote: row.review_note ?? undefined,
        requiredApprovals: row.required_approvals,
        approvalCount: row.approval_count,
        denialCount: row.denial_count,
        reviews: row.reviews,
        revokedBy: row.revoked_by ?? undefined,
        revokedAt: toIso(row.revoked_at) ?? undefined,
        revokeNote: row.revoke_note ?? undefined,
      })),
      rotationRuns: rotationRuns.rows.map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        credentialId: row.credential_id,
        status: row.status,
        source: row.source,
        reason: row.reason,
        dueAt: toIso(row.due_at) ?? undefined,
        plannedAt: toIso(row.planned_at),
        startedAt: toIso(row.started_at) ?? undefined,
        completedAt: toIso(row.completed_at) ?? undefined,
        plannedBy: row.planned_by,
        updatedBy: row.updated_by,
        note: row.note ?? undefined,
        targetRef: row.target_ref ?? undefined,
        resultNote: row.result_note ?? undefined,
      })),
      auditEvents: auditEvents.rows.map((row) => ({
        eventId: row.event_id,
        occurredAt: toIso(row.occurred_at),
        tenantId: row.tenant_id,
        type: row.type,
        action: row.action,
        outcome: row.outcome,
        principal: row.principal,
        correlationId: row.correlation_id,
        metadata: row.metadata,
      })),
    });
    const backup = this.filterBackupForTenant(fullBackup, actor?.tenantId);

    if (actor) {
      await this.audit.record({
        type: "system.backup",
        action: "system.backup.export",
        outcome: "success",
        tenantId: actor.tenantId,
        principal: actor.principal,
        metadata: this.summarizeBackup(backup),
      });
    }

    return backup;
  }

  public async writeBackup(filePath: string, actor?: AuthContext): Promise<KeyLoreBackup> {
    const backup = await this.exportBackup(actor);
    await fs.writeFile(filePath, `${JSON.stringify(backup, null, 2)}\n`, "utf8");
    return backup;
  }

  public async readBackup(filePath: string): Promise<KeyLoreBackup> {
    const raw = await fs.readFile(filePath, "utf8");
    return this.parseBackupPayload(JSON.parse(raw));
  }

  public async restoreBackupPayload(backup: KeyLoreBackup, actor?: AuthContext): Promise<KeyLoreBackup> {
    if (actor?.tenantId) {
      this.assertTenantScopedBackup(backup, actor.tenantId);
    }

    await this.database.withTransaction(async (client) => {
      if (actor?.tenantId) {
        await client.query("DELETE FROM access_tokens WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM refresh_tokens WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM approval_requests WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM break_glass_requests WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM rotation_runs WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM audit_events WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM oauth_clients WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM policy_rules WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM credentials WHERE tenant_id = $1", [actor.tenantId]);
        await client.query("DELETE FROM tenants WHERE tenant_id = $1", [actor.tenantId]);
      } else {
        await client.query("DELETE FROM access_tokens");
        await client.query("DELETE FROM refresh_tokens");
        await client.query("DELETE FROM approval_requests");
        await client.query("DELETE FROM break_glass_requests");
        await client.query("DELETE FROM rotation_runs");
        await client.query("DELETE FROM audit_events");
        await client.query("DELETE FROM oauth_clients");
        await client.query("DELETE FROM policy_rules");
        await client.query("DELETE FROM credentials");
        await client.query("DELETE FROM tenants");
        await client.query("DELETE FROM request_rate_limits");
      }

      for (const tenant of backup.tenants) {
        await client.query(
          `INSERT INTO tenants (
             tenant_id, display_name, description, status, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            tenant.tenantId,
            tenant.displayName,
            tenant.description ?? null,
            tenant.status,
            tenant.createdAt,
            tenant.updatedAt,
          ],
        );
      }

      for (const credential of backup.credentials) {
        await client.query(
          `INSERT INTO credentials (
             id, tenant_id, display_name, service, owner, scope_tier, sensitivity,
             allowed_domains, permitted_operations, expires_at, rotation_policy,
             last_validated_at, selection_notes, binding, tags, status
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15, $16
           )`,
          [
            credential.id,
            credential.tenantId,
            credential.displayName,
            credential.service,
            credential.owner,
            credential.scopeTier,
            credential.sensitivity,
            credential.allowedDomains,
            credential.permittedOperations,
            credential.expiresAt,
            credential.rotationPolicy,
            credential.lastValidatedAt,
            credential.selectionNotes,
            credential.binding,
            credential.tags,
            credential.status,
          ],
        );
      }

      for (const rule of backup.policies.rules) {
        await client.query(
          `INSERT INTO policy_rules (
             id, tenant_id, effect, description, principals, principal_roles, credential_ids,
             services, operations, domain_patterns, environments
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11
           )`,
          [
            rule.id,
            rule.tenantId,
            rule.effect,
            rule.description,
            rule.principals,
            rule.principalRoles ?? null,
            rule.credentialIds ?? null,
            rule.services ?? null,
            rule.operations,
            rule.domainPatterns,
            rule.environments ?? null,
          ],
        );
      }

      for (const clientRecord of backup.authClients as StoredAuthClient[]) {
        await client.query(
          `INSERT INTO oauth_clients (
             client_id, tenant_id, display_name, secret_hash, secret_salt, roles, allowed_scopes, status,
             token_endpoint_auth_method, grant_types, redirect_uris, jwks
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            clientRecord.clientId,
            clientRecord.tenantId,
            clientRecord.displayName,
            clientRecord.secretHash ?? null,
            clientRecord.secretSalt ?? null,
            clientRecord.roles,
            clientRecord.allowedScopes,
            clientRecord.status,
            clientRecord.tokenEndpointAuthMethod,
            clientRecord.grantTypes,
            clientRecord.redirectUris,
            clientRecord.jwks,
          ],
        );
      }

      for (const token of backup.accessTokens) {
        await client.query(
          `INSERT INTO access_tokens (
             token_id, token_hash, client_id, tenant_id, subject, scopes, roles,
             resource, expires_at, status, created_at, last_used_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12
           )`,
          [
            token.tokenId,
            token.tokenHash,
            token.clientId,
            token.tenantId,
            token.subject,
            token.scopes,
            token.roles,
            token.resource ?? null,
            token.expiresAt,
            token.status,
            token.createdAt,
            token.lastUsedAt ?? null,
          ],
        );
      }

      for (const token of backup.refreshTokens) {
        await client.query(
          `INSERT INTO refresh_tokens (
             refresh_token_id, token_hash, client_id, tenant_id, subject, scopes, roles,
             resource, expires_at, status, created_at, last_used_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12
           )`,
          [
            token.refreshTokenId,
            token.tokenHash,
            token.clientId,
            token.tenantId,
            token.subject,
            token.scopes,
            token.roles,
            token.resource ?? null,
            token.expiresAt,
            token.status,
            token.createdAt,
            token.lastUsedAt ?? null,
          ],
        );
      }

      for (const approval of backup.approvals) {
        await client.query(
          `INSERT INTO approval_requests (
             id, tenant_id, created_at, expires_at, status, requested_by, requested_roles,
             credential_id, operation, target_url, target_host, reason, rule_id,
             correlation_id, fingerprint, reviewed_by, reviewed_at, review_note,
             required_approvals, approval_count, denial_count, reviews
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18,
             $19, $20, $21, $22
           )`,
          [
            approval.id,
            approval.tenantId,
            approval.createdAt,
            approval.expiresAt,
            approval.status,
            approval.requestedBy,
            approval.requestedRoles,
            approval.credentialId,
            approval.operation,
            approval.targetUrl,
            approval.targetHost,
            approval.reason,
            approval.ruleId ?? null,
            approval.correlationId,
            approval.fingerprint,
            approval.reviewedBy ?? null,
            approval.reviewedAt ?? null,
            approval.reviewNote ?? null,
            approval.requiredApprovals,
            approval.approvalCount,
            approval.denialCount,
            approval.reviews,
          ],
        );
      }

      for (const request of backup.breakGlassRequests) {
        await client.query(
          `INSERT INTO break_glass_requests (
             id, tenant_id, created_at, expires_at, status, requested_by, requested_roles,
             credential_id, operation, target_url, target_host, justification, requested_duration_seconds,
             correlation_id, fingerprint, reviewed_by, reviewed_at, review_note,
             required_approvals, approval_count, denial_count, reviews,
             revoked_by, revoked_at, revoke_note
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18,
             $19, $20, $21, $22,
             $23, $24, $25
           )`,
          [
            request.id,
            request.tenantId,
            request.createdAt,
            request.expiresAt,
            request.status,
            request.requestedBy,
            request.requestedRoles,
            request.credentialId,
            request.operation,
            request.targetUrl,
            request.targetHost,
            request.justification,
            request.requestedDurationSeconds,
            request.correlationId,
            request.fingerprint,
            request.reviewedBy ?? null,
            request.reviewedAt ?? null,
            request.reviewNote ?? null,
            request.requiredApprovals,
            request.approvalCount,
            request.denialCount,
            request.reviews,
            request.revokedBy ?? null,
            request.revokedAt ?? null,
            request.revokeNote ?? null,
          ],
        );
      }

      for (const rotation of backup.rotationRuns) {
        await client.query(
          `INSERT INTO rotation_runs (
             id, tenant_id, credential_id, status, source, reason, due_at, planned_at, started_at,
             completed_at, planned_by, updated_by, note, target_ref, result_note
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9,
             $10, $11, $12, $13, $14, $15
           )`,
          [
            rotation.id,
            rotation.tenantId,
            rotation.credentialId,
            rotation.status,
            rotation.source,
            rotation.reason,
            rotation.dueAt ?? null,
            rotation.plannedAt,
            rotation.startedAt ?? null,
            rotation.completedAt ?? null,
            rotation.plannedBy,
            rotation.updatedBy,
            rotation.note ?? null,
            rotation.targetRef ?? null,
            rotation.resultNote ?? null,
          ],
        );
      }

      for (const event of backup.auditEvents) {
        await client.query(
          `INSERT INTO audit_events (
             event_id, occurred_at, tenant_id, type, action, outcome, principal, correlation_id, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            event.eventId,
            event.occurredAt,
            event.tenantId,
            event.type,
            event.action,
            event.outcome,
            event.principal,
            event.correlationId,
            event.metadata,
          ],
        );
      }
    });

    if (actor) {
      await this.audit.record({
        type: "system.backup",
        action: "system.backup.restore",
        outcome: "success",
        tenantId: actor.tenantId,
        principal: actor.principal,
        metadata: this.summarizeBackup(backup),
      });
    }

    return backup;
  }

  public async restoreBackup(filePath: string, actor?: AuthContext): Promise<KeyLoreBackup> {
    const backup = await this.readBackup(filePath);
    return this.restoreBackupPayload(backup, actor);
  }
}
