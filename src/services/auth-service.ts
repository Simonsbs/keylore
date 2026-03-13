import { randomBytes } from "node:crypto";

import {
  AccessScope,
  accessScopeSchema,
  AuthClientRecord,
  AuthContext,
  authContextSchema,
  PrincipalRole,
  TokenIssueInput,
  TokenIssueOutput,
  tokenIssueOutputSchema,
} from "../domain/types.js";
import { PgAccessTokenRepository } from "../repositories/pg-access-token-repository.js";
import { AuthClientRepository } from "../repositories/interfaces.js";
import { hashOpaqueToken, verifySecret } from "./auth-secrets.js";

function uniqueScopes(scopes: string[]): AccessScope[] {
  return Array.from(new Set(scopes)).map((scope) => accessScopeSchema.parse(scope));
}

function normalizeResource(resource: string): string {
  return resource.endsWith("/") ? resource.slice(0, -1) : resource;
}

export class AuthService {
  public constructor(
    private readonly clients: AuthClientRepository,
    private readonly tokens: PgAccessTokenRepository,
    private readonly issuerUrl: string,
    private readonly publicBaseUrl: string,
    private readonly accessTokenTtlSeconds: number,
  ) {}

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
      throw new Error("Invalid client credentials.");
    }

    if (!verifySecret(input.clientSecret, client.secretSalt, client.secretHash)) {
      throw new Error("Invalid client credentials.");
    }

    const requestedScopes = input.scope?.length ? input.scope : client.allowedScopes;
    const grantedScopes = uniqueScopes(
      requestedScopes.filter((scope) => client.allowedScopes.includes(scope)),
    );

    if (grantedScopes.length === 0) {
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
      throw new Error("Invalid access token.");
    }

    if (new Date(stored.expiresAt).getTime() <= Date.now()) {
      throw new Error("Access token expired.");
    }

    if (
      stored.resource &&
      requestedResource &&
      normalizeResource(stored.resource) !== normalizeResource(requestedResource)
    ) {
      throw new Error("Access token resource does not match this protected resource.");
    }

    await this.tokens.touch(stored.tokenHash);

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
}
