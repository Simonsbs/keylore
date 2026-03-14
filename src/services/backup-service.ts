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
} from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { StoredAuthClient } from "../repositories/interfaces.js";
import { SqlDatabase } from "../storage/database.js";

const storedAuthClientSchema = authClientRecordSchema.extend({
  secretHash: z.string().min(1),
  secretSalt: z.string().min(1),
});

const backupEnvelopeSchema = z.object({
  format: z.literal("keylore-logical-backup"),
  version: z.number().int().positive(),
  createdAt: z.string().datetime(),
  sourceVersion: z.string().min(1),
  credentials: z.array(credentialRecordSchema),
  policies: policyFileSchema,
  authClients: z.array(storedAuthClientSchema),
  accessTokens: z.array(accessTokenRecordSchema.extend({ tokenHash: z.string().min(1) })),
  approvals: z.array(approvalRequestSchema),
  breakGlassRequests: z.array(breakGlassRequestSchema),
  auditEvents: z.array(auditEventSchema),
});

interface BackupCredentialRow {
  id: string;
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
  display_name: string;
  secret_hash: string;
  secret_salt: string;
  roles: string[];
  allowed_scopes: string[];
  status: "active" | "disabled";
}

interface BackupAccessTokenRow {
  token_id: string;
  token_hash: string;
  client_id: string;
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
  type: string;
  action: string;
  outcome: "allowed" | "denied" | "success" | "error";
  principal: string;
  correlation_id: string;
  metadata: Record<string, unknown>;
}

interface BackupBreakGlassRow {
  id: string;
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
      credentials: backup.credentials.length,
      authClients: backup.authClients.length,
      accessTokens: backup.accessTokens.length,
      approvals: backup.approvals.length,
      breakGlassRequests: backup.breakGlassRequests.length,
      auditEvents: backup.auditEvents.length,
    });
  }

  public parseBackupPayload(payload: unknown): KeyLoreBackup {
    return backupEnvelopeSchema.parse(payload);
  }

  public async exportBackup(actor?: AuthContext): Promise<KeyLoreBackup> {
    const [credentials, policies, authClients, accessTokens, approvals, breakGlassRequests, auditEvents] = await Promise.all([
      this.database.query<BackupCredentialRow>("SELECT * FROM credentials ORDER BY id"),
      this.database.query<BackupPolicyRow>("SELECT * FROM policy_rules ORDER BY id"),
      this.database.query<BackupAuthClientRow>("SELECT * FROM oauth_clients ORDER BY client_id"),
      this.database.query<BackupAccessTokenRow>("SELECT * FROM access_tokens ORDER BY created_at"),
      this.database.query<BackupApprovalRow>("SELECT * FROM approval_requests ORDER BY created_at"),
      this.database.query<BackupBreakGlassRow>("SELECT * FROM break_glass_requests ORDER BY created_at"),
      this.database.query<BackupAuditRow>("SELECT * FROM audit_events ORDER BY occurred_at"),
    ]);

    const backup = backupEnvelopeSchema.parse({
      format: "keylore-logical-backup",
      version: 1,
      createdAt: new Date().toISOString(),
      sourceVersion: this.sourceVersion,
      credentials: credentials.rows.map((row) => ({
        id: row.id,
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
        displayName: row.display_name,
        roles: row.roles,
        allowedScopes: row.allowed_scopes,
        status: row.status,
        secretHash: row.secret_hash,
        secretSalt: row.secret_salt,
      })),
      accessTokens: accessTokens.rows.map((row) => ({
        tokenId: row.token_id,
        tokenHash: row.token_hash,
        clientId: row.client_id,
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
      auditEvents: auditEvents.rows.map((row) => ({
        eventId: row.event_id,
        occurredAt: toIso(row.occurred_at),
        type: row.type,
        action: row.action,
        outcome: row.outcome,
        principal: row.principal,
        correlationId: row.correlation_id,
        metadata: row.metadata,
      })),
    });

    if (actor) {
      await this.audit.record({
        type: "system.backup",
        action: "system.backup.export",
        outcome: "success",
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
    await this.database.withTransaction(async (client) => {
      await client.query("DELETE FROM access_tokens");
      await client.query("DELETE FROM approval_requests");
      await client.query("DELETE FROM break_glass_requests");
      await client.query("DELETE FROM audit_events");
      await client.query("DELETE FROM oauth_clients");
      await client.query("DELETE FROM policy_rules");
      await client.query("DELETE FROM credentials");
      await client.query("DELETE FROM request_rate_limits");

      for (const credential of backup.credentials) {
        await client.query(
          `INSERT INTO credentials (
             id, display_name, service, owner, scope_tier, sensitivity,
             allowed_domains, permitted_operations, expires_at, rotation_policy,
             last_validated_at, selection_notes, binding, tags, status
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10,
             $11, $12, $13, $14, $15
           )`,
          [
            credential.id,
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
             id, effect, description, principals, principal_roles, credential_ids,
             services, operations, domain_patterns, environments
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10
           )`,
          [
            rule.id,
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
             client_id, display_name, secret_hash, secret_salt, roles, allowed_scopes, status
           ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            clientRecord.clientId,
            clientRecord.displayName,
            clientRecord.secretHash,
            clientRecord.secretSalt,
            clientRecord.roles,
            clientRecord.allowedScopes,
            clientRecord.status,
          ],
        );
      }

      for (const token of backup.accessTokens) {
        await client.query(
          `INSERT INTO access_tokens (
             token_id, token_hash, client_id, subject, scopes, roles,
             resource, expires_at, status, created_at, last_used_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11
           )`,
          [
            token.tokenId,
            token.tokenHash,
            token.clientId,
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
             id, created_at, expires_at, status, requested_by, requested_roles,
             credential_id, operation, target_url, target_host, reason, rule_id,
             correlation_id, fingerprint, reviewed_by, reviewed_at, review_note,
             required_approvals, approval_count, denial_count, reviews
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17,
             $18, $19, $20, $21
           )`,
          [
            approval.id,
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
             id, created_at, expires_at, status, requested_by, requested_roles,
             credential_id, operation, target_url, target_host, justification, requested_duration_seconds,
             correlation_id, fingerprint, reviewed_by, reviewed_at, review_note,
             required_approvals, approval_count, denial_count, reviews,
             revoked_by, revoked_at, revoke_note
           ) VALUES (
             $1, $2, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17,
             $18, $19, $20, $21,
             $22, $23, $24
           )`,
          [
            request.id,
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

      for (const event of backup.auditEvents) {
        await client.query(
          `INSERT INTO audit_events (
             event_id, occurred_at, type, action, outcome, principal, correlation_id, metadata
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            event.eventId,
            event.occurredAt,
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
