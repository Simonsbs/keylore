import { randomBytes } from "node:crypto";

import {
  AccessScope,
  AccessTokenRecord,
  accessScopeSchema,
  AuthClientCreateInput,
  AuthClientRecord,
  AuthContext,
  authClientRecordSchema,
  authClientSecretOutputSchema,
  authContextSchema,
  AuthClientUpdateInput,
  PrincipalRole,
  TokenIssueInput,
  TokenIssueOutput,
  tokenIssueOutputSchema,
} from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import { AccessTokenRepository, AuthClientRepository } from "../repositories/interfaces.js";
import { hashOpaqueToken, hashSecret, verifySecret } from "./auth-secrets.js";
import { TelemetryService } from "./telemetry.js";

function uniqueScopes(scopes: string[]): AccessScope[] {
  return Array.from(new Set(scopes)).map((scope) => accessScopeSchema.parse(scope));
}

function normalizeResource(resource: string): string {
  return resource.endsWith("/") ? resource.slice(0, -1) : resource;
}

export class AuthService {
  public constructor(
    private readonly clients: AuthClientRepository,
    private readonly tokens: AccessTokenRepository,
    private readonly audit: PgAuditLogService,
    private readonly issuerUrl: string,
    private readonly publicBaseUrl: string,
    private readonly accessTokenTtlSeconds: number,
    private readonly telemetry: TelemetryService,
  ) {}

  private generateClientSecret(): string {
    return `kls_${randomBytes(24).toString("base64url")}`;
  }

  public oauthMetadata() {
    return {
      issuer: this.issuerUrl,
      token_endpoint: `${this.publicBaseUrl}/oauth/token`,
      grant_types_supported: ["client_credentials"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      scopes_supported: accessScopeSchema.options,
    };
  }

  public protectedResourceMetadata(resourcePath: "/mcp" | "/v1") {
    const resource = `${this.publicBaseUrl}${resourcePath}`;
    return {
      resource,
      authorization_servers: [this.issuerUrl],
      scopes_supported: accessScopeSchema.options,
      bearer_methods_supported: ["header"],
      resource_name: resourcePath === "/mcp" ? "KeyLore MCP" : "KeyLore REST API",
    };
  }

  public async issueToken(input: TokenIssueInput): Promise<TokenIssueOutput> {
    const client = await this.clients.getByClientId(input.clientId);
    if (!client || client.status !== "active") {
      this.telemetry.recordAuthTokenIssued("error");
      throw new Error("Invalid client credentials.");
    }

    if (!verifySecret(input.clientSecret, client.secretSalt, client.secretHash)) {
      this.telemetry.recordAuthTokenIssued("error");
      throw new Error("Invalid client credentials.");
    }

    const requestedScopes = input.scope?.length ? input.scope : client.allowedScopes;
    const grantedScopes = uniqueScopes(
      requestedScopes.filter((scope) => client.allowedScopes.includes(scope)),
    );

    if (grantedScopes.length === 0) {
      this.telemetry.recordAuthTokenIssued("error");
      throw new Error("No valid scopes were granted.");
    }

    const token = `kl_${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + this.accessTokenTtlSeconds * 1000).toISOString();
    await this.tokens.issue({
      tokenHash: hashOpaqueToken(token),
      clientId: client.clientId,
      subject: client.clientId,
      scopes: grantedScopes,
      roles: client.roles,
      resource: input.resource,
      expiresAt,
    });

    await this.audit.record({
      type: "auth.token",
      action: "auth.token.issue",
      outcome: "success",
      principal: client.clientId,
      metadata: {
        clientId: client.clientId,
        scopes: grantedScopes,
        resource: input.resource ?? null,
        expiresAt,
      },
    });

    this.telemetry.recordAuthTokenIssued("success");

    return tokenIssueOutputSchema.parse({
      access_token: token,
      token_type: "Bearer",
      expires_in: this.accessTokenTtlSeconds,
      scope: grantedScopes.join(" "),
    });
  }

  public async authenticateBearerToken(token: string, requestedResource?: string): Promise<AuthContext> {
    const stored = await this.tokens.getByHash(hashOpaqueToken(token));
    if (!stored || stored.status !== "active") {
      this.telemetry.recordAuthTokenValidation("error");
      throw new Error("Invalid access token.");
    }

    if (new Date(stored.expiresAt).getTime() <= Date.now()) {
      this.telemetry.recordAuthTokenValidation("error");
      throw new Error("Access token expired.");
    }

    if (
      stored.resource &&
      requestedResource &&
      normalizeResource(stored.resource) !== normalizeResource(requestedResource)
    ) {
      this.telemetry.recordAuthTokenValidation("error");
      throw new Error("Access token resource does not match this protected resource.");
    }

    await this.tokens.touch(stored.tokenHash);
    this.telemetry.recordAuthTokenValidation("success");

    return authContextSchema.parse({
      principal: stored.subject,
      clientId: stored.clientId,
      roles: stored.roles,
      scopes: stored.scopes,
      resource: stored.resource,
    });
  }

  public requireScopes(context: AuthContext, requiredScopes: AccessScope[]): void {
    const missing = requiredScopes.filter((scope) => !context.scopes.includes(scope));
    if (missing.length > 0) {
      throw new Error(`Missing required scopes: ${missing.join(", ")}`);
    }
  }

  public requireAnyScope(context: AuthContext, allowedScopes: AccessScope[]): void {
    if (!allowedScopes.some((scope) => context.scopes.includes(scope))) {
      throw new Error(`Missing one of the required scopes: ${allowedScopes.join(", ")}`);
    }
  }

  public requireRoles(context: AuthContext, requiredRoles: PrincipalRole[]): void {
    if (!requiredRoles.some((role) => context.roles.includes(role))) {
      throw new Error(`Missing required role. Need one of: ${requiredRoles.join(", ")}`);
    }
  }

  public stripClientSecrets(client: AuthClientRecord): AuthClientRecord {
    return client;
  }

  public async listClients(): Promise<AuthClientRecord[]> {
    return this.clients.list();
  }

  public async createClient(
    actor: AuthContext,
    input: AuthClientCreateInput,
  ): Promise<ReturnType<typeof authClientSecretOutputSchema.parse>> {
    const existing = await this.clients.getByClientId(input.clientId);
    if (existing) {
      throw new Error(`Client already exists: ${input.clientId}`);
    }

    const clientSecret = input.clientSecret ?? this.generateClientSecret();
    const hashed = hashSecret(clientSecret);
    await this.clients.upsert({
      clientId: input.clientId,
      displayName: input.displayName,
      secretHash: hashed.hash,
      secretSalt: hashed.salt,
      roles: input.roles,
      allowedScopes: input.allowedScopes,
      status: input.status,
    });

    const client = authClientRecordSchema.parse({
      clientId: input.clientId,
      displayName: input.displayName,
      roles: input.roles,
      allowedScopes: input.allowedScopes,
      status: input.status,
    });

    await this.audit.record({
      type: "auth.client",
      action: "auth.client.create",
      outcome: "success",
      principal: actor.principal,
      metadata: {
        clientId: client.clientId,
        roles: client.roles,
        allowedScopes: client.allowedScopes,
        status: client.status,
      },
    });

    return authClientSecretOutputSchema.parse({
      client,
      clientSecret,
    });
  }

  public async updateClient(
    actor: AuthContext,
    clientId: string,
    patch: AuthClientUpdateInput,
  ): Promise<AuthClientRecord | undefined> {
    const existing = await this.clients.getByClientId(clientId);
    if (!existing) {
      return undefined;
    }

    await this.clients.upsert({
      clientId,
      displayName: patch.displayName ?? existing.displayName,
      secretHash: existing.secretHash,
      secretSalt: existing.secretSalt,
      roles: patch.roles ?? existing.roles,
      allowedScopes: patch.allowedScopes ?? existing.allowedScopes,
      status: patch.status ?? existing.status,
    });

    const updated = authClientRecordSchema.parse({
      clientId,
      displayName: patch.displayName ?? existing.displayName,
      roles: patch.roles ?? existing.roles,
      allowedScopes: patch.allowedScopes ?? existing.allowedScopes,
      status: patch.status ?? existing.status,
    });

    if (patch.roles || patch.allowedScopes || patch.status) {
      await this.tokens.revokeByClientId(clientId);
    }

    await this.audit.record({
      type: "auth.client",
      action: "auth.client.update",
      outcome: "success",
      principal: actor.principal,
      metadata: {
        clientId,
        fields: Object.keys(patch),
        status: updated.status,
      },
    });

    return updated;
  }

  public async rotateClientSecret(
    actor: AuthContext,
    clientId: string,
    clientSecret?: string,
  ): Promise<ReturnType<typeof authClientSecretOutputSchema.parse> | undefined> {
    const existing = await this.clients.getByClientId(clientId);
    if (!existing) {
      return undefined;
    }

    const secret = clientSecret ?? this.generateClientSecret();
    const hashed = hashSecret(secret);
    await this.clients.upsert({
      clientId,
      displayName: existing.displayName,
      secretHash: hashed.hash,
      secretSalt: hashed.salt,
      roles: existing.roles,
      allowedScopes: existing.allowedScopes,
      status: existing.status,
    });
    await this.tokens.revokeByClientId(clientId);

    const client = authClientRecordSchema.parse({
      clientId,
      displayName: existing.displayName,
      roles: existing.roles,
      allowedScopes: existing.allowedScopes,
      status: existing.status,
    });

    await this.audit.record({
      type: "auth.client",
      action: "auth.client.rotate_secret",
      outcome: "success",
      principal: actor.principal,
      metadata: {
        clientId,
      },
    });

    return authClientSecretOutputSchema.parse({
      client,
      clientSecret: secret,
    });
  }

  public async listTokens(filter?: {
    clientId?: string;
    status?: "active" | "revoked";
  }): Promise<AccessTokenRecord[]> {
    return this.tokens.list(filter);
  }

  public async revokeToken(
    actor: AuthContext,
    tokenId: string,
  ): Promise<AccessTokenRecord | undefined> {
    const token = await this.tokens.revokeById(tokenId);
    if (token) {
      await this.audit.record({
        type: "auth.token",
        action: "auth.token.revoke",
        outcome: "success",
        principal: actor.principal,
        metadata: {
          tokenId: token.tokenId,
          clientId: token.clientId,
          subject: token.subject,
        },
      });
    }

    return token;
  }
}
