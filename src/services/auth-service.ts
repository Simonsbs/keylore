import {
  createHash,
  createPublicKey,
  randomBytes,
  randomUUID,
  verify as verifySignature,
} from "node:crypto";

import {
  AccessScope,
  AccessTokenRecord,
  accessScopeSchema,
  AuthClientAuthMethod,
  AuthClientCreateInput,
  AuthClientRecord,
  authClientRecordSchema,
  authClientSecretOutputSchema,
  authContextSchema,
  AuthClientUpdateInput,
  authorizationRequestOutputSchema,
  PrincipalRole,
  publicJwkSchema,
  RefreshTokenRecord,
  tokenIssueOutputSchema,
  TokenIssueInput,
  TokenIssueOutput,
} from "../domain/types.js";
import { PgAuditLogService } from "../repositories/pg-audit-log.js";
import {
  AccessTokenRepository,
  AuthorizationCodeRepository,
  AuthClientRepository,
  OAuthClientAssertionRepository,
  RefreshTokenRepository,
  TenantRepository,
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

function uniqueRoles(roles: PrincipalRole[]): PrincipalRole[] {
  return Array.from(new Set(roles));
}

function normalizeResource(resource: string): string {
  return resource.endsWith("/") ? resource.slice(0, -1) : resource;
}

function decodeBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function encodeBase64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly authorizationCodes: AuthorizationCodeRepository,
    private readonly assertions: OAuthClientAssertionRepository,
    private readonly tenants: TenantRepository,
    private readonly audit: PgAuditLogService,
    private readonly issuerUrl: string,
    private readonly publicBaseUrl: string,
    private readonly accessTokenTtlSeconds: number,
    private readonly authorizationCodeTtlSeconds: number,
    private readonly refreshTokenTtlSeconds: number,
    private readonly telemetry: TelemetryService,
  ) {}

  private generateClientSecret(): string {
    return `kls_${randomBytes(24).toString("base64url")}`;
  }

  private generateOpaqueToken(prefix: string): string {
    return `${prefix}_${randomBytes(32).toString("base64url")}`;
  }

  private tokenEndpointUrl(): string {
    return `${this.publicBaseUrl}/oauth/token`;
  }

  private authorizationEndpointUrl(): string {
    return `${this.publicBaseUrl}/oauth/authorize`;
  }

  private buildClientRecord(client: {
    clientId: string;
    tenantId: string;
    displayName: string;
    roles: PrincipalRole[];
    allowedScopes: AccessScope[];
    status: "active" | "disabled";
    tokenEndpointAuthMethod: AuthClientAuthMethod;
    grantTypes: Array<"client_credentials" | "authorization_code" | "refresh_token">;
    redirectUris: string[];
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
      grantTypes: client.grantTypes,
      redirectUris: client.redirectUris,
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
    if (client.tokenEndpointAuthMethod === "none") {
      return;
    }

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

    if (client.tokenEndpointAuthMethod === "none") {
      return;
    }

    if (client.tokenEndpointAuthMethod === "private_key_jwt") {
      if (input.clientAssertionType !== clientAssertionType || !input.clientAssertion) {
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

  private async requireActiveTenant(tenantId: string): Promise<void> {
    const tenant = await this.tenants.getById(tenantId);
    if (!tenant) {
      throw new Error(`Unknown tenant: ${tenantId}`);
    }
    if (tenant.status !== "active") {
      throw new Error(`Tenant is disabled: ${tenantId}`);
    }
  }

  private codeChallengeForVerifier(verifier: string): string {
    return encodeBase64Url(createHash("sha256").update(verifier).digest());
  }

  private async issueAccessTokenRecord(input: {
    clientId: string;
    tenantId: string;
    subject: string;
    scopes: AccessScope[];
    roles: PrincipalRole[];
    resource?: string;
    grantType: "client_credentials" | "authorization_code" | "refresh_token";
  }): Promise<string> {
    const token = this.generateOpaqueToken("kl");
    const expiresAt = new Date(Date.now() + this.accessTokenTtlSeconds * 1000).toISOString();
    await this.tokens.issue({
      tokenHash: hashOpaqueToken(token),
      clientId: input.clientId,
      tenantId: input.tenantId,
      subject: input.subject,
      scopes: input.scopes,
      roles: input.roles,
      resource: input.resource,
      expiresAt,
    });
    await this.audit.record({
      type: "auth.token",
      action: "auth.token.issue",
      outcome: "success",
      tenantId: input.tenantId,
      principal: input.subject,
      metadata: {
        clientId: input.clientId,
        tenantId: input.tenantId,
        scopes: input.scopes,
        resource: input.resource ?? null,
        expiresAt,
        grantType: input.grantType,
      },
    });
    return token;
  }

  private async issueRefreshTokenRecord(input: {
    clientId: string;
    tenantId: string;
    subject: string;
    scopes: AccessScope[];
    roles: PrincipalRole[];
    resource?: string;
  }): Promise<string> {
    const refreshToken = this.generateOpaqueToken("klr");
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlSeconds * 1000).toISOString();
    await this.refreshTokens.issue({
      tokenHash: hashOpaqueToken(refreshToken),
      clientId: input.clientId,
      tenantId: input.tenantId,
      subject: input.subject,
      scopes: input.scopes,
      roles: input.roles,
      resource: input.resource,
      expiresAt,
    });
    await this.audit.record({
      type: "auth.token",
      action: "auth.refresh.issue",
      outcome: "success",
      tenantId: input.tenantId,
      principal: input.subject,
      metadata: {
        clientId: input.clientId,
        tenantId: input.tenantId,
        scopes: input.scopes,
        resource: input.resource ?? null,
        expiresAt,
      },
    });
    return refreshToken;
  }

  public oauthMetadata() {
    return {
      issuer: this.issuerUrl,
      token_endpoint: this.tokenEndpointUrl(),
      authorization_endpoint: this.authorizationEndpointUrl(),
      grant_types_supported: ["client_credentials", "authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "client_secret_post",
        "client_secret_basic",
        "private_key_jwt",
        "none",
      ],
      token_endpoint_auth_signing_alg_values_supported: ["RS256", "ES256"],
      scopes_supported: accessScopeSchema.options,
      code_challenge_methods_supported: ["S256"],
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

  public async authorize(
    actor: {
      principal: string;
      clientId: string;
      tenantId?: string;
      roles: PrincipalRole[];
      scopes: AccessScope[];
      resource?: string;
    },
    input: {
      clientId: string;
      redirectUri: string;
      scope?: AccessScope[];
      resource?: string;
      codeChallenge: string;
      codeChallengeMethod: "S256";
      state?: string;
    },
  ) {
    const client = await this.clients.getByClientId(input.clientId);
    if (!client || client.status !== "active") {
      throw new Error("Unknown authorization client.");
    }
    if (!client.grantTypes.includes("authorization_code")) {
      throw new Error("Client does not support authorization_code.");
    }
    if (!client.redirectUris.includes(input.redirectUri)) {
      throw new Error("Invalid redirect URI.");
    }
    if (actor.tenantId && client.tenantId !== actor.tenantId) {
      throw new Error("Tenant access denied.");
    }
    if (actor.resource && input.resource && normalizeResource(actor.resource) !== normalizeResource(input.resource)) {
      throw new Error("Requested resource exceeds the caller resource binding.");
    }
    await this.requireActiveTenant(client.tenantId);

    const requestedScopes = input.scope?.length ? input.scope : client.allowedScopes;
    const grantedScopes = uniqueScopes(
      requestedScopes.filter(
        (scope) => actor.scopes.includes(scope) && client.allowedScopes.includes(scope),
      ),
    );
    if (grantedScopes.length === 0) {
      throw new Error("No valid scopes were granted.");
    }

    const grantedRoles = uniqueRoles(
      actor.roles.filter((role) => client.roles.includes(role)),
    );
    if (grantedRoles.length === 0) {
      throw new Error("No valid roles were granted.");
    }

    const code = this.generateOpaqueToken("klc");
    const expiresAt = new Date(Date.now() + this.authorizationCodeTtlSeconds * 1000).toISOString();
    await this.authorizationCodes.create({
      codeId: randomUUID(),
      codeHash: hashOpaqueToken(code),
      clientId: client.clientId,
      tenantId: client.tenantId,
      subject: actor.principal,
      scopes: grantedScopes,
      roles: grantedRoles,
      resource: input.resource ?? actor.resource,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      expiresAt,
    });

    await this.audit.record({
      type: "auth.token",
      action: "auth.code.authorize",
      outcome: "success",
      tenantId: client.tenantId,
      principal: actor.principal,
      metadata: {
        clientId: client.clientId,
        tenantId: client.tenantId,
        redirectUri: input.redirectUri,
        scopes: grantedScopes,
        resource: input.resource ?? actor.resource ?? null,
        expiresAt,
      },
    });

    return authorizationRequestOutputSchema.parse({
      code,
      clientId: client.clientId,
      tenantId: client.tenantId,
      subject: actor.principal,
      redirectUri: input.redirectUri,
      expiresIn: this.authorizationCodeTtlSeconds,
      scope: grantedScopes.join(" "),
      state: input.state,
    });
  }

  public async issueToken(input: TokenIssueInput): Promise<TokenIssueOutput> {
    const client = await this.clients.getByClientId(input.clientId);
    if (!client || client.status !== "active") {
      this.telemetry.recordAuthTokenIssued("error");
      throw new Error("Invalid client credentials.");
    }
    await this.requireActiveTenant(client.tenantId);

    try {
      if (input.grantType === "client_credentials") {
        await this.authenticateClientCredentials(client, input);
        if (!client.grantTypes.includes("client_credentials")) {
          throw new Error("Unsupported grant type for client.");
        }

        const requestedScopes = input.scope?.length ? input.scope : client.allowedScopes;
        const grantedScopes = uniqueScopes(
          requestedScopes.filter((scope) => client.allowedScopes.includes(scope)),
        );
        if (grantedScopes.length === 0) {
          throw new Error("No valid scopes were granted.");
        }

        const accessToken = await this.issueAccessTokenRecord({
          clientId: client.clientId,
          tenantId: client.tenantId,
          subject: client.clientId,
          scopes: grantedScopes,
          roles: client.roles,
          resource: input.resource,
          grantType: "client_credentials",
        });
        this.telemetry.recordAuthTokenIssued("success");
        return tokenIssueOutputSchema.parse({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: this.accessTokenTtlSeconds,
          scope: grantedScopes.join(" "),
        });
      }

      if (input.grantType === "authorization_code") {
        await this.authenticateClientCredentials(client, input);
        if (!client.grantTypes.includes("authorization_code")) {
          throw new Error("Unsupported grant type for client.");
        }

        const authorizationCode = await this.authorizationCodes.consumeByHash(hashOpaqueToken(input.code ?? ""));
        if (!authorizationCode) {
          throw new Error("Invalid authorization code.");
        }
        if (authorizationCode.clientId !== client.clientId) {
          throw new Error("Invalid authorization code.");
        }
        if (authorizationCode.redirectUri !== input.redirectUri) {
          throw new Error("Invalid redirect URI.");
        }
        if (authorizationCode.codeChallengeMethod !== "S256") {
          throw new Error("Unsupported code challenge method.");
        }
        if (authorizationCode.codeChallenge !== this.codeChallengeForVerifier(input.codeVerifier ?? "")) {
          throw new Error("Invalid code verifier.");
        }

        const grantedScopes = uniqueScopes(
          (input.scope?.length ? input.scope : authorizationCode.scopes).filter((scope) =>
            authorizationCode.scopes.includes(scope),
          ),
        );
        if (grantedScopes.length === 0) {
          throw new Error("No valid scopes were granted.");
        }

        const accessToken = await this.issueAccessTokenRecord({
          clientId: client.clientId,
          tenantId: authorizationCode.tenantId,
          subject: authorizationCode.subject,
          scopes: grantedScopes,
          roles: authorizationCode.roles,
          resource: authorizationCode.resource,
          grantType: "authorization_code",
        });
        const refreshToken = client.grantTypes.includes("refresh_token")
          ? await this.issueRefreshTokenRecord({
              clientId: client.clientId,
              tenantId: authorizationCode.tenantId,
              subject: authorizationCode.subject,
              scopes: grantedScopes,
              roles: authorizationCode.roles,
              resource: authorizationCode.resource,
            })
          : undefined;
        this.telemetry.recordAuthTokenIssued("success");
        return tokenIssueOutputSchema.parse({
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: "Bearer",
          expires_in: this.accessTokenTtlSeconds,
          scope: grantedScopes.join(" "),
        });
      }

      await this.authenticateClientCredentials(client, input);
      if (!client.grantTypes.includes("refresh_token")) {
        throw new Error("Unsupported grant type for client.");
      }
      const refreshTokenRecord = await this.refreshTokens.getByHash(
        hashOpaqueToken(input.refreshToken ?? ""),
      );
      if (!refreshTokenRecord || refreshTokenRecord.status !== "active") {
        throw new Error("Invalid refresh token.");
      }
      if (refreshTokenRecord.clientId !== client.clientId) {
        throw new Error("Invalid refresh token.");
      }
      if (new Date(refreshTokenRecord.expiresAt).getTime() <= Date.now()) {
        throw new Error("Refresh token expired.");
      }
      if (
        refreshTokenRecord.resource &&
        input.resource &&
        normalizeResource(refreshTokenRecord.resource) !== normalizeResource(input.resource)
      ) {
        throw new Error("Refresh token resource does not match this protected resource.");
      }
      await this.requireActiveTenant(refreshTokenRecord.tenantId);

      const grantedScopes = uniqueScopes(
        (input.scope?.length ? input.scope : refreshTokenRecord.scopes).filter((scope) =>
          refreshTokenRecord.scopes.includes(scope),
        ),
      );
      if (grantedScopes.length === 0) {
        throw new Error("No valid scopes were granted.");
      }

      const accessToken = await this.issueAccessTokenRecord({
        clientId: client.clientId,
        tenantId: refreshTokenRecord.tenantId,
        subject: refreshTokenRecord.subject,
        scopes: grantedScopes,
        roles: refreshTokenRecord.roles,
        resource: refreshTokenRecord.resource,
        grantType: "refresh_token",
      });

      const rotatedRefreshToken = await this.issueRefreshTokenRecord({
        clientId: client.clientId,
        tenantId: refreshTokenRecord.tenantId,
        subject: refreshTokenRecord.subject,
        scopes: grantedScopes,
        roles: refreshTokenRecord.roles,
        resource: refreshTokenRecord.resource,
      });
      const replacementRecord = await this.refreshTokens.getByHash(hashOpaqueToken(rotatedRefreshToken));
      if (!replacementRecord) {
        throw new Error("Failed to rotate refresh token.");
      }
      await this.refreshTokens.replace(
        hashOpaqueToken(input.refreshToken ?? ""),
        replacementRecord.refreshTokenId,
      );
      await this.audit.record({
        type: "auth.token",
        action: "auth.refresh.rotate",
        outcome: "success",
        tenantId: refreshTokenRecord.tenantId,
        principal: refreshTokenRecord.subject,
        metadata: {
          clientId: client.clientId,
          tenantId: refreshTokenRecord.tenantId,
          refreshTokenId: refreshTokenRecord.refreshTokenId,
        },
      });

      this.telemetry.recordAuthTokenIssued("success");
      return tokenIssueOutputSchema.parse({
        access_token: accessToken,
        refresh_token: rotatedRefreshToken,
        token_type: "Bearer",
        expires_in: this.accessTokenTtlSeconds,
        scope: grantedScopes.join(" "),
      });
    } catch (error) {
      this.telemetry.recordAuthTokenIssued("error");
      throw error;
    }
  }

  public async authenticateBearerToken(token: string, requestedResource?: string) {
    const stored = await this.tokens.getByHash(hashOpaqueToken(token));
    if (!stored || stored.status !== "active") {
      this.telemetry.recordAuthTokenValidation("error");
      throw new Error("Invalid access token.");
    }
    await this.requireActiveTenant(stored.tenantId);

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

  public requireScopes(context: { scopes: AccessScope[] }, requiredScopes: AccessScope[]): void {
    const missing = requiredScopes.filter((scope) => !context.scopes.includes(scope));
    if (missing.length > 0) {
      throw new Error(`Missing required scopes: ${missing.join(", ")}`);
    }
  }

  public requireAnyScope(context: { scopes: AccessScope[] }, allowedScopes: AccessScope[]): void {
    if (!allowedScopes.some((scope) => context.scopes.includes(scope))) {
      throw new Error(`Missing one of the required scopes: ${allowedScopes.join(", ")}`);
    }
  }

  public requireRoles(context: { roles: PrincipalRole[] }, requiredRoles: PrincipalRole[]): void {
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
    actor: { principal: string; tenantId?: string },
    input: AuthClientCreateInput,
  ): Promise<ReturnType<typeof authClientSecretOutputSchema.parse>> {
    const existing = await this.clients.getByClientId(input.clientId);
    if (existing) {
      throw new Error(`Client already exists: ${input.clientId}`);
    }
    if (actor.tenantId && input.tenantId !== actor.tenantId) {
      throw new Error("Tenant access denied.");
    }
    const tenant = await this.tenants.getById(input.tenantId);
    if (!tenant) {
      throw new Error(`Unknown tenant: ${input.tenantId}`);
    }

    const isSharedSecretClient = !["private_key_jwt", "none"].includes(input.tokenEndpointAuthMethod);
    const clientSecret = isSharedSecretClient ? input.clientSecret ?? this.generateClientSecret() : undefined;
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
      grantTypes: input.grantTypes,
      redirectUris: input.redirectUris,
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
      grantTypes: input.grantTypes,
      redirectUris: input.redirectUris,
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
        grantTypes: client.grantTypes,
        redirectUris: client.redirectUris,
      },
    });

    return authClientSecretOutputSchema.parse({
      client,
      clientSecret,
    });
  }

  public async updateClient(
    actor: { principal: string; tenantId?: string },
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
      grantTypes: patch.grantTypes ?? existing.grantTypes,
      redirectUris: patch.redirectUris ?? existing.redirectUris,
      jwks: patch.jwks ?? existing.jwks,
    });

    const sharedSecretClient = !["private_key_jwt", "none"].includes(merged.tokenEndpointAuthMethod);
    await this.clients.upsert({
      clientId,
      tenantId: merged.tenantId,
      displayName: merged.displayName,
      secretHash: sharedSecretClient ? existing.secretHash : undefined,
      secretSalt: sharedSecretClient ? existing.secretSalt : undefined,
      roles: merged.roles,
      allowedScopes: merged.allowedScopes,
      status: merged.status,
      tokenEndpointAuthMethod: merged.tokenEndpointAuthMethod,
      grantTypes: merged.grantTypes,
      redirectUris: merged.redirectUris,
      jwks: merged.jwks,
    });

    if (
      patch.roles ||
      patch.allowedScopes ||
      patch.status ||
      patch.tokenEndpointAuthMethod ||
      patch.grantTypes ||
      patch.redirectUris ||
      patch.jwks
    ) {
      await this.tokens.revokeByClientId(clientId);
      await this.refreshTokens.revokeByClientId(clientId);
      await this.authorizationCodes.revokeByClientId(clientId);
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
        grantTypes: merged.grantTypes,
      },
    });

    return merged;
  }

  public async rotateClientSecret(
    actor: { principal: string; tenantId?: string },
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
    if (["private_key_jwt", "none"].includes(existing.tokenEndpointAuthMethod)) {
      throw new Error(`${existing.tokenEndpointAuthMethod} clients do not support shared-secret rotation.`);
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
      grantTypes: existing.grantTypes,
      redirectUris: existing.redirectUris,
      jwks: existing.jwks,
    });
    await this.tokens.revokeByClientId(clientId);
    await this.refreshTokens.revokeByClientId(clientId);
    await this.authorizationCodes.revokeByClientId(clientId);

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

  public async listRefreshTokens(filter?: {
    clientId?: string;
    tenantId?: string;
    status?: "active" | "revoked";
  }): Promise<RefreshTokenRecord[]> {
    return this.refreshTokens.list(filter);
  }

  public async revokeToken(
    actor: { principal: string; tenantId?: string },
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

  public async revokeRefreshToken(
    actor: { principal: string; tenantId?: string },
    refreshTokenId: string,
  ): Promise<RefreshTokenRecord | undefined> {
    const token = await this.refreshTokens.revokeById(refreshTokenId);
    if (token) {
      if (actor.tenantId && token.tenantId !== actor.tenantId) {
        throw new Error("Tenant access denied.");
      }
      await this.audit.record({
        type: "auth.token",
        action: "auth.refresh.revoke",
        outcome: "success",
        tenantId: token.tenantId,
        principal: actor.principal,
        metadata: {
          refreshTokenId: token.refreshTokenId,
          tenantId: token.tenantId,
          clientId: token.clientId,
          subject: token.subject,
        },
      });
    }
    return token;
  }
}
