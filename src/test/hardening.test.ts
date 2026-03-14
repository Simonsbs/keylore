import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { startHttpServer } from "../http/server.js";
import { makeTestApp } from "./helpers.js";

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function issueAuthorizationCode(params: {
  baseUrl: string;
  actorToken: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  resource: string;
  verifier: string;
}) {
  const response = await fetch(`${params.baseUrl}/oauth/authorize`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${params.actorToken}`,
    },
    body: JSON.stringify({
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      scope: params.scope,
      resource: params.resource,
      codeChallenge: pkceChallenge(params.verifier),
      codeChallengeMethod: "S256",
      state: "hardening-state",
    }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as { code: string };
}

test("authorization codes are single-use and reject replay", async () => {
  const { app, auth, close } = await makeTestApp({
    authClients: [
      {
        clientId: "interactive-admin",
        tenantId: "default",
        displayName: "Interactive Admin",
        roles: ["admin"],
        allowedScopes: ["catalog:read", "mcp:use"],
        status: "active",
        clientSecret: "interactive-admin-secret",
      },
      {
        clientId: "public-mcp-client",
        tenantId: "default",
        displayName: "Public MCP Client",
        roles: ["admin"],
        allowedScopes: ["catalog:read", "mcp:use"],
        status: "active",
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["http://127.0.0.1/callback"],
      },
    ],
    configOverrides: {
      httpPort: 8903,
      publicBaseUrl: "http://127.0.0.1:8903",
      oauthIssuerUrl: "http://127.0.0.1:8903/oauth",
    },
  });
  const server = await startHttpServer(app);
  try {
    const actorToken = await auth.issueToken({
      clientId: "interactive-admin",
      clientSecret: "interactive-admin-secret",
      grantType: "client_credentials",
      scope: ["catalog:read", "mcp:use"],
      resource: "http://127.0.0.1:8903/v1",
    });
    const verifier = "pkce-hardening-single-use-verifier-1234567890abcdef";
    const authorization = await issueAuthorizationCode({
      baseUrl: "http://127.0.0.1:8903",
      actorToken: actorToken.access_token,
      clientId: "public-mcp-client",
      redirectUri: "http://127.0.0.1/callback",
      scope: ["catalog:read", "mcp:use"],
      resource: "http://127.0.0.1:8903/v1",
      verifier,
    });

    const firstExchange = await fetch("http://127.0.0.1:8903/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "public-mcp-client",
        code: authorization.code,
        code_verifier: verifier,
        redirect_uri: "http://127.0.0.1/callback",
      }),
    });
    assert.equal(firstExchange.status, 200);

    const replayExchange = await fetch("http://127.0.0.1:8903/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "public-mcp-client",
        code: authorization.code,
        code_verifier: verifier,
        redirect_uri: "http://127.0.0.1/callback",
      }),
    });
    assert.equal(replayExchange.status, 401);
    assert.match(((await replayExchange.json()) as { error: string }).error, /invalid authorization code/i);
  } finally {
    await server.close();
    await close();
  }
});

test("rotated refresh tokens reject replay while the replacement token remains valid", async () => {
  const { app, auth, close } = await makeTestApp({
    authClients: [
      {
        clientId: "interactive-admin",
        tenantId: "default",
        displayName: "Interactive Admin",
        roles: ["admin"],
        allowedScopes: ["catalog:read", "mcp:use"],
        status: "active",
        clientSecret: "interactive-admin-secret",
      },
      {
        clientId: "public-mcp-client",
        tenantId: "default",
        displayName: "Public MCP Client",
        roles: ["admin"],
        allowedScopes: ["catalog:read", "mcp:use"],
        status: "active",
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["http://127.0.0.1/callback"],
      },
    ],
    configOverrides: {
      httpPort: 8904,
      publicBaseUrl: "http://127.0.0.1:8904",
      oauthIssuerUrl: "http://127.0.0.1:8904/oauth",
    },
  });
  const server = await startHttpServer(app);
  try {
    const actorToken = await auth.issueToken({
      clientId: "interactive-admin",
      clientSecret: "interactive-admin-secret",
      grantType: "client_credentials",
      scope: ["catalog:read", "mcp:use"],
      resource: "http://127.0.0.1:8904/v1",
    });
    const authorization = await issueAuthorizationCode({
      baseUrl: "http://127.0.0.1:8904",
      actorToken: actorToken.access_token,
      clientId: "public-mcp-client",
      redirectUri: "http://127.0.0.1/callback",
      scope: ["catalog:read", "mcp:use"],
      resource: "http://127.0.0.1:8904/v1",
      verifier: "pkce-hardening-rotation-verifier-1234567890abcdef",
    });

    const initialTokenResponse = await fetch("http://127.0.0.1:8904/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "public-mcp-client",
        code: authorization.code,
        code_verifier: "pkce-hardening-rotation-verifier-1234567890abcdef",
        redirect_uri: "http://127.0.0.1/callback",
      }),
    });
    assert.equal(initialTokenResponse.status, 200);
    const initialTokens = (await initialTokenResponse.json()) as { refresh_token: string };

    const rotatedResponse = await fetch("http://127.0.0.1:8904/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "public-mcp-client",
        refresh_token: initialTokens.refresh_token,
      }),
    });
    assert.equal(rotatedResponse.status, 200);
    const rotatedTokens = (await rotatedResponse.json()) as { refresh_token: string };
    assert.notEqual(rotatedTokens.refresh_token, initialTokens.refresh_token);

    const replayedRefresh = await fetch("http://127.0.0.1:8904/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "public-mcp-client",
        refresh_token: initialTokens.refresh_token,
      }),
    });
    assert.equal(replayedRefresh.status, 401);
    assert.match(((await replayedRefresh.json()) as { error: string }).error, /invalid refresh token/i);

    const replacementRefresh = await fetch("http://127.0.0.1:8904/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "public-mcp-client",
        refresh_token: rotatedTokens.refresh_token,
      }),
    });
    assert.equal(replacementRefresh.status, 200);
  } finally {
    await server.close();
    await close();
  }
});

test("tenant-scoped auth admins cannot revoke foreign access or refresh tokens", async () => {
  const { app, auth, close } = await makeTestApp({
    authClients: [
      {
        clientId: "tenant-a-auth-admin",
        tenantId: "tenant-a",
        displayName: "Tenant A Auth Admin",
        roles: ["auth_admin"],
        allowedScopes: ["auth:write"],
        status: "active",
        clientSecret: "tenant-a-auth-admin-secret",
      },
      {
        clientId: "tenant-b-consumer",
        tenantId: "tenant-b",
        displayName: "Tenant B Consumer",
        roles: ["consumer"],
        allowedScopes: ["catalog:read"],
        status: "active",
        clientSecret: "tenant-b-consumer-secret",
      },
      {
        clientId: "tenant-b-interactive",
        tenantId: "tenant-b",
        displayName: "Tenant B Interactive",
        roles: ["admin"],
        allowedScopes: ["catalog:read", "mcp:use"],
        status: "active",
        clientSecret: "tenant-b-interactive-secret",
      },
      {
        clientId: "tenant-b-public",
        tenantId: "tenant-b",
        displayName: "Tenant B Public",
        roles: ["admin"],
        allowedScopes: ["catalog:read", "mcp:use"],
        status: "active",
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["http://127.0.0.1/callback"],
      },
    ],
    configOverrides: {
      httpPort: 8905,
      publicBaseUrl: "http://127.0.0.1:8905",
      oauthIssuerUrl: "http://127.0.0.1:8905/oauth",
    },
  });
  const server = await startHttpServer(app);
  try {
    const tenantAAdminToken = await auth.issueToken({
      clientId: "tenant-a-auth-admin",
      clientSecret: "tenant-a-auth-admin-secret",
      grantType: "client_credentials",
      scope: ["auth:write"],
      resource: "http://127.0.0.1:8905/v1",
    });
    const tenantBAccessToken = await auth.issueToken({
      clientId: "tenant-b-consumer",
      clientSecret: "tenant-b-consumer-secret",
      grantType: "client_credentials",
      scope: ["catalog:read"],
      resource: "http://127.0.0.1:8905/v1",
    });
    const tenantBInteractiveToken = await auth.issueToken({
      clientId: "tenant-b-interactive",
      clientSecret: "tenant-b-interactive-secret",
      grantType: "client_credentials",
      scope: ["catalog:read", "mcp:use"],
      resource: "http://127.0.0.1:8905/v1",
    });
    const tenantBAuthorization = await issueAuthorizationCode({
      baseUrl: "http://127.0.0.1:8905",
      actorToken: tenantBInteractiveToken.access_token,
      clientId: "tenant-b-public",
      redirectUri: "http://127.0.0.1/callback",
      scope: ["catalog:read", "mcp:use"],
      resource: "http://127.0.0.1:8905/v1",
      verifier: "pkce-tenant-b-verifier-1234567890abcdef1234567890",
    });
    const tenantBPublicTokenResponse = await fetch("http://127.0.0.1:8905/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "tenant-b-public",
        code: tenantBAuthorization.code,
        code_verifier: "pkce-tenant-b-verifier-1234567890abcdef1234567890",
        redirect_uri: "http://127.0.0.1/callback",
      }),
    });
    assert.equal(tenantBPublicTokenResponse.status, 200);
    const tenantBPublicTokens = (await tenantBPublicTokenResponse.json()) as { refresh_token: string };

    const foreignAccessToken = (
      await app.auth.listTokens({ tenantId: "tenant-b", clientId: "tenant-b-consumer" })
    )[0];
    const foreignRefreshToken = (
      await app.auth.listRefreshTokens({ tenantId: "tenant-b", clientId: "tenant-b-public" })
    )[0];
    assert.ok(foreignAccessToken);
    assert.ok(foreignRefreshToken);

    const revokeForeignAccess = await fetch(
      `http://127.0.0.1:8905/v1/auth/tokens/${foreignAccessToken?.tokenId}/revoke`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tenantAAdminToken.access_token}`,
        },
      },
    );
    assert.equal(revokeForeignAccess.status, 403);

    const revokeForeignRefresh = await fetch(
      `http://127.0.0.1:8905/v1/auth/refresh-tokens/${foreignRefreshToken?.refreshTokenId}/revoke`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${tenantAAdminToken.access_token}`,
        },
      },
    );
    assert.equal(revokeForeignRefresh.status, 403);

    const foreignAccessStillWorks = await fetch("http://127.0.0.1:8905/v1/catalog/credentials", {
      headers: {
        authorization: `Bearer ${tenantBAccessToken.access_token}`,
      },
    });
    assert.equal(foreignAccessStillWorks.status, 200);

    const foreignRefreshStillWorks = await fetch("http://127.0.0.1:8905/oauth/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "tenant-b-public",
        refresh_token: tenantBPublicTokens.refresh_token,
      }),
    });
    assert.equal(foreignRefreshStillWorks.status, 200);
  } finally {
    await server.close();
    await close();
  }
});

test("tenant-scoped backup restore rejects foreign tenant payloads over HTTP", async () => {
  const { app, auth, close } = await makeTestApp({
    authClients: [
      {
        clientId: "tenant-a-backup",
        tenantId: "tenant-a",
        displayName: "Tenant A Backup",
        roles: ["backup_operator"],
        allowedScopes: ["backup:read", "backup:write"],
        status: "active",
        clientSecret: "tenant-a-backup-secret",
      },
    ],
    catalog: {
      version: 1,
      credentials: [
        {
          id: "tenant-a-demo",
          tenantId: "tenant-a",
          displayName: "Tenant A Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "moderate",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Tenant A only",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
          },
          tags: ["tenant-a"],
          status: "active",
        },
      ],
    },
    policies: {
      version: 1,
      rules: [],
    },
    configOverrides: {
      httpPort: 8906,
      publicBaseUrl: "http://127.0.0.1:8906",
      oauthIssuerUrl: "http://127.0.0.1:8906/oauth",
    },
  });
  const server = await startHttpServer(app);
  try {
    const backupToken = await auth.issueToken({
      clientId: "tenant-a-backup",
      clientSecret: "tenant-a-backup-secret",
      grantType: "client_credentials",
      scope: ["backup:read", "backup:write"],
      resource: "http://127.0.0.1:8906/v1",
    });

    const exportResponse = await fetch("http://127.0.0.1:8906/v1/system/backups/export", {
      method: "POST",
      headers: {
        authorization: `Bearer ${backupToken.access_token}`,
      },
    });
    assert.equal(exportResponse.status, 200);
    const backup = ((await exportResponse.json()) as { backup: Record<string, unknown> }).backup as {
      tenants: Array<Record<string, unknown>>;
      credentials: Array<Record<string, unknown>>;
    };

    const restoreResponse = await fetch("http://127.0.0.1:8906/v1/system/backups/restore", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${backupToken.access_token}`,
      },
      body: JSON.stringify({
        confirm: true,
        backup: {
          ...backup,
          tenants: [
            ...backup.tenants,
            {
              tenantId: "tenant-b",
              displayName: "Tenant B",
              description: "Foreign tenant",
              status: "active",
              createdAt: "2026-03-14T00:00:00.000Z",
              updatedAt: "2026-03-14T00:00:00.000Z",
            },
          ],
        },
      }),
    });
    assert.equal(restoreResponse.status, 403);
    assert.match(((await restoreResponse.json()) as { error: string }).error, /foreign tenant data/i);
  } finally {
    await server.close();
    await close();
  }
});
