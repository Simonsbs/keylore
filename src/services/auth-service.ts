import { createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";

import {
  AccessScope,
  AccessTokenRecord,
  accessScopeSchema,
  AuthClientAuthMethod,
  AuthClientCreateInput,
  AuthClientRecord,
  AuthContext,
  authClientRecordSchema,
  authClientSecretOutputSchema,
  authContextSchema,
  AuthClientUpdateInput,
  PrincipalRole,
  publicJwkSchema,
  TokenIssueInput,
  TokenIssueOutput,
  tokenIssueOutputSchema,
} from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import {
  AccessTokenRepository,
  AuthClientRepository,
  OAuthClientAssertionRepository,
} from "../repositories/interfaces.js";
import { hashOpaqueToken, hashSecret, verifySecret } from "./auth-secrets.js";
import { TelemetryService } from "./telemetry.js";

interface JwtHeader {
  alg?: string;
  kid?: string;
  typ?: string;
}

interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;
}

const clientAssertionType = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

function uniqueScopes(scopes: string[]): AccessScope[] {
  return Array.from(new Set(scopes)).map((scope) => accessScopeSchema.parse(scope));
}

function normalizeResource(resource: string): string {
  return resource.endsWith("/") ? resource.slice(0, -1) : resource;
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function signatureAlgorithm(alg: string): "RSA-SHA256" | "sha256" {
  if (alg === "RS256") {
    return "RSA-SHA256";
  }
  if (alg === "ES256") {
    return "sha256";
  }
  throw new Error(`Unsupported client assertion algorithm: ${alg}`);
}

export class AuthService {
  public constructor(
    private readonly clients: AuthClientRepository,
    private readonly tokens: AccessTokenRepository,
    private readonly assertions: OAuthClientAssertionRepository,
    private readonly audit: PgAuditLogService,
    private readonly issuerUrl: string,
    private readonly publicBaseUrl: string,
    private readonly accessTokenTtlSeconds: number,
    private readonly telemetry: TelemetryService,
  ) {}

  private generateClientSecret(): string {
    return `kls_${randomBytes(24).toString("base64url")}`;
  }

  private tokenEndpointUrl(): string {
    return `${this.publicBaseUrl}/oauth/token`;
  }

  private buildClientRecord(client: {
    clientId: string;
    tenantId: string;
    displayName: string;
    roles: PrincipalRole[];
    allowedScopes: AccessScope[];
    status: "active" | "disabled";
    tokenEndpointAuthMethod: AuthClientAuthMethod;
    jwks?: Array<Record<string, unknown>>;
  }): AuthClientRecord {
    return authClientRecordSchema.parse({
      clientId: client.clientId,
      tenantId: client.tenantId,
      displayName: client.displayName,
      roles: client.roles,
      allowedScopes: client.allowedScopes,
      status: client.status,
      tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
      jwks: client.jwks ?? [],
    });
  }

  private assertClientConfiguration(client: {
    clientId: string;
    tokenEndpointAuthMethod: AuthClientAuthMethod;
    jwks: Array<Record<string, unknown>>;
    secretHash?: string;
    secretSalt?: string;
  }): void {
    if (client.tokenEndpointAuthMethod === "private_key_jwt") {
      if (!client.jwks.length) {
        throw new Error(`Client ${client.clientId} is missing public JWKs.`);
      }
      return;
    }

    if (!client.secretHash || !client.secretSalt) {
      throw new Error(`Client ${client.clientId} is missing shared-secret material.`);
    }
  }

  private async authenticateClientCredentials(
    client: {
      clientId: string;
      tokenEndpointAuthMethod: AuthClientAuthMethod;
      jwks: Array<Record<string, unknown>>;
      secretHash?: string;
      secretSalt?: string;
    },
    input: TokenIssueInput,
  ): Promise<void> {
    this.assertClientConfiguration(client);

    if (client.tokenEndpointAuthMethod === "private_key_jwt") {
      if (
        input.clientAssertionType !== clientAssertionType ||
        !input.clientAssertion
      ) {
        throw new Error("Missing private_key_jwt client assertion.");
      }
      await this.verifyClientAssertion(client, input.clientAssertion);
      return;
    }

    if (!input.clientSecret || !client.secretHash || !client.secretSalt) {
      throw new Error("Invalid client credentials.");
    }

    if (!verifySecret(input.clientSecret, client.secretSalt, client.secretHash)) {
      throw new Error("Invalid client credentials.");
    }
  }

  private async verifyClientAssertion(
    client: {
      clientId: string;
      jwks: Array<Record<string, unknown>>;
    },
    assertion: string,
  ): Promise<void> {
    const [encodedHeader, encodedPayload, encodedSignature] = assertion.split(".");
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error("Invalid client assertion.");
    }

    const header = parseJson<JwtHeader>(decodeBase64Url(encodedHeader).toString("utf8"));
    const claims = parseJson<JwtClaims>(decodeBase64Url(encodedPayload).toString("utf8"));
    if (!header.alg) {
      throw new Error("Client assertion is missing alg.");
    }

    const jwks = client.jwks.map((entry) => publicJwkSchema.parse(entry));
    const selectedJwk =
      (header.kid
        ? jwks.find((entry) => entry.kid === header.kid)
        : jwks.length === 1
          ? jwks[0]
          : undefined) ?? jwks[0];
    if (!selectedJwk) {
      throw new Error("No matching public JWK for client assertion.");
    }

    const verified = verifySignature(
      signatureAlgorithm(header.alg),
      Buffer.from(`${encodedHeader}.${encodedPayload}`),
      createPublicKey({ key: selectedJwk, format: "jwk" }),
      decodeBase64Url(encodedSignature),
    );
    if (!verified) {
      throw new Error("Invalid client assertion signature.");
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(claims.aud) ? claims.aud : claims.aud ? [claims.aud] : [];
    if (claims.iss !== client.clientId || claims.sub !== client.clientId) {
      throw new Error("Client assertion subject does not match client.");
    }
    if (!audiences.includes(this.issuerUrl) && !audiences.includes(this.tokenEndpointUrl())) {
      throw new Error("Client assertion audience is invalid.");
    }
    if (!claims.exp || claims.exp <= nowSeconds) {
      throw new Error("Client assertion expired.");
    }
    if (claims.iat && claims.iat < nowSeconds - 300) {
      throw new Error("Client assertion is too old.");
    }
    if (claims.nbf && claims.nbf > nowSeconds + 30) {
      throw new Error("Client assertion is not valid yet.");
    }
    if (!claims.jti || claims.jti.length < 8) {
      throw new Error("Client assertion jti is required.");
    }

    const registered = await this.assertions.register(
      client.clientId,
      claims.jti,
      new Date(claims.exp * 1000).toISOString(),
    );
    if (!registered) {
      throw new Error("Client assertion replay detected.");
    }
  }

  public oauthMetadata() {
    return {
      issuer: this.issuerUrl,
      token_endpoint: this.tokenEndpointUrl(),
      grant_types_supported: ["client_credentials"],
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
        "private_key_jwt",
      ],
      token_endpoint_auth_signing_alg_values_supported: ["RS256", "ES256"],
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

    try {
      await this.authenticateClientCredentials(client, input);
    } catch (error) {
      this.telemetry.recordAuthTokenIssued("error");
      throw error;
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
      tenantId: client.tenantId,
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
      tenantId: client.tenantId,
      principal: client.clientId,
      metadata: {
        clientId: client.clientId,
        tenantId: client.tenantId,
        scopes: grantedScopes,
        resource: input.resource ?? null,
        expiresAt,
        authMethod: client.tokenEndpointAuthMethod,
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
      tenantId: stored.tenantId,
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

    if (actor.tenantId && input.tenantId !== actor.tenantId) {
      throw new Error("Tenant access denied.");
    }
    const isPrivateKey = input.tokenEndpointAuthMethod === "private_key_jwt";
    const clientSecret = isPrivateKey ? undefined : input.clientSecret ?? this.generateClientSecret();
    const hashed = clientSecret ? hashSecret(clientSecret) : undefined;
    await this.clients.upsert({
      clientId: input.clientId,
      tenantId: input.tenantId,
      displayName: input.displayName,
      secretHash: hashed?.hash,
      secretSalt: hashed?.salt,
      roles: input.roles,
      allowedScopes: input.allowedScopes,
      status: input.status,
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
      jwks: input.jwks ?? [],
    });

    const client = this.buildClientRecord({
      clientId: input.clientId,
      tenantId: input.tenantId,
      displayName: input.displayName,
      roles: input.roles,
      allowedScopes: input.allowedScopes,
      status: input.status,
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod,
      jwks: input.jwks,
    });

    await this.audit.record({
      type: "auth.client",
      action: "auth.client.create",
      outcome: "success",
      tenantId: client.tenantId,
      principal: actor.principal,
      metadata: {
        clientId: client.clientId,
        tenantId: client.tenantId,
        roles: client.roles,
        allowedScopes: client.allowedScopes,
        status: client.status,
        authMethod: client.tokenEndpointAuthMethod,
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
    if (actor.tenantId && existing.tenantId !== actor.tenantId) {
      throw new Error("Tenant access denied.");
    }

    const merged = this.buildClientRecord({
      clientId,
      tenantId: existing.tenantId,
      displayName: patch.displayName ?? existing.displayName,
      roles: patch.roles ?? existing.roles,
      allowedScopes: patch.allowedScopes ?? existing.allowedScopes,
      status: patch.status ?? existing.status,
      tokenEndpointAuthMethod: patch.tokenEndpointAuthMethod ?? existing.tokenEndpointAuthMethod,
      jwks: patch.jwks ?? existing.jwks,
    });

    const switchingToPrivateKey = merged.tokenEndpointAuthMethod === "private_key_jwt";
    await this.clients.upsert({
      clientId,
      tenantId: merged.tenantId,
      displayName: merged.displayName,
      secretHash: switchingToPrivateKey ? undefined : existing.secretHash,
      secretSalt: switchingToPrivateKey ? undefined : existing.secretSalt,
      roles: merged.roles,
      allowedScopes: merged.allowedScopes,
      status: merged.status,
      tokenEndpointAuthMethod: merged.tokenEndpointAuthMethod,
      jwks: merged.jwks,
    });

    if (patch.roles || patch.allowedScopes || patch.status || patch.tokenEndpointAuthMethod || patch.jwks) {
      await this.tokens.revokeByClientId(clientId);
    }

    await this.audit.record({
      type: "auth.client",
      action: "auth.client.update",
      outcome: "success",
      tenantId: merged.tenantId,
      principal: actor.principal,
      metadata: {
        clientId,
        tenantId: merged.tenantId,
        fields: Object.keys(patch),
        status: merged.status,
        authMethod: merged.tokenEndpointAuthMethod,
      },
    });

    return merged;
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
    if (actor.tenantId && existing.tenantId !== actor.tenantId) {
      throw new Error("Tenant access denied.");
    }
    if (existing.tokenEndpointAuthMethod === "private_key_jwt") {
      throw new Error("private_key_jwt clients do not support shared-secret rotation.");
    }

    const secret = clientSecret ?? this.generateClientSecret();
    const hashed = hashSecret(secret);
    await this.clients.upsert({
      clientId,
      tenantId: existing.tenantId,
      displayName: existing.displayName,
      secretHash: hashed.hash,
      secretSalt: hashed.salt,
      roles: existing.roles,
      allowedScopes: existing.allowedScopes,
      status: existing.status,
      tokenEndpointAuthMethod: existing.tokenEndpointAuthMethod,
      jwks: existing.jwks,
    });
    await this.tokens.revokeByClientId(clientId);

    const client = this.buildClientRecord(existing);

    await this.audit.record({
      type: "auth.client",
      action: "auth.client.rotate_secret",
      outcome: "success",
      tenantId: client.tenantId,
      principal: actor.principal,
      metadata: {
        clientId,
        tenantId: client.tenantId,
      },
    });

    return authClientSecretOutputSchema.parse({
      client,
      clientSecret: secret,
    });
  }

  public async listTokens(filter?: {
    clientId?: string;
    tenantId?: string;
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
      if (actor.tenantId && token.tenantId !== actor.tenantId) {
        throw new Error("Tenant access denied.");
      }
      await this.audit.record({
        type: "auth.token",
        action: "auth.token.revoke",
        outcome: "success",
        tenantId: token.tenantId,
        principal: actor.principal,
        metadata: {
          tokenId: token.tokenId,
          tenantId: token.tenantId,
          clientId: token.clientId,
          subject: token.subject,
        },
      });
    }

    return token;
  }
}
