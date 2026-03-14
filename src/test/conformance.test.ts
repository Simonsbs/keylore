import assert from "node:assert/strict";
import test from "node:test";

import { startHttpServer } from "../http/server.js";
import { localOperatorContext } from "../services/auth-context.js";
import { makeTestApp } from "./helpers.js";

test("oauth metadata advertises the supported grant and auth contracts", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8899,
      publicBaseUrl: "http://127.0.0.1:8899",
      oauthIssuerUrl: "http://127.0.0.1:8899/oauth",
    },
  });
  const server = await startHttpServer(app);

  const metadataResponse = await fetch("http://127.0.0.1:8899/.well-known/oauth-authorization-server");
  assert.equal(metadataResponse.status, 200);
  const metadata = (await metadataResponse.json()) as {
    grant_types_supported: string[];
    token_endpoint_auth_methods_supported: string[];
    code_challenge_methods_supported: string[];
  };
  assert.deepEqual(metadata.grant_types_supported, [
    "client_credentials",
    "authorization_code",
    "refresh_token",
  ]);
  assert.deepEqual(metadata.code_challenge_methods_supported, ["S256"]);
  assert.equal(metadata.token_endpoint_auth_methods_supported.includes("none"), true);

  const resourceResponse = await fetch("http://127.0.0.1:8899/.well-known/oauth-protected-resource/api");
  assert.equal(resourceResponse.status, 200);
  const resource = (await resourceResponse.json()) as { resource: string };
  assert.equal(resource.resource, "http://127.0.0.1:8899/v1");

  await server.close();
  await close();
});

test("public oauth clients cannot use client_credentials", async () => {
  const { app, close } = await makeTestApp({
    authClients: [
      {
        clientId: "public-client",
        displayName: "Public Client",
        roles: ["consumer"],
        allowedScopes: ["catalog:read"],
        status: "active",
        tokenEndpointAuthMethod: "none",
        grantTypes: ["authorization_code", "refresh_token"],
        redirectUris: ["http://127.0.0.1/callback"],
      },
    ],
    configOverrides: {
      httpPort: 8900,
      publicBaseUrl: "http://127.0.0.1:8900",
      oauthIssuerUrl: "http://127.0.0.1:8900/oauth",
    },
  });
  const server = await startHttpServer(app);

  const tokenResponse = await fetch("http://127.0.0.1:8900/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "public-client",
      scope: "catalog:read",
      resource: "http://127.0.0.1:8900/v1",
    }),
  });
  assert.equal(tokenResponse.status, 400);
  const error = (await tokenResponse.json()) as { error: string };
  assert.match(error.error, /unsupported grant type/i);

  await server.close();
  await close();
});

test("disabled tenants block new token issuance and existing bearer use", async () => {
  const { app, auth, close } = await makeTestApp({
    authClients: [
      {
        clientId: "tenant-disabled-client",
        tenantId: "tenant-disabled",
        displayName: "Tenant Disabled Client",
        roles: ["consumer"],
        allowedScopes: ["catalog:read"],
        status: "active",
        clientSecret: "tenant-disabled-secret",
      },
    ],
    configOverrides: {
      httpPort: 8901,
      publicBaseUrl: "http://127.0.0.1:8901",
      oauthIssuerUrl: "http://127.0.0.1:8901/oauth",
    },
  });
  const server = await startHttpServer(app);

  const initialToken = await auth.issueToken({
    clientId: "tenant-disabled-client",
    clientSecret: "tenant-disabled-secret",
    grantType: "client_credentials",
    scope: ["catalog:read"],
    resource: "http://127.0.0.1:8901/v1",
  });

  const disabledTenant = await app.tenants.update(localOperatorContext("local-operator"), "tenant-disabled", {
    status: "disabled",
  });
  assert.equal(disabledTenant?.status, "disabled");

  const staleBearerResponse = await fetch("http://127.0.0.1:8901/v1/catalog/credentials", {
    headers: {
      authorization: `Bearer ${initialToken.access_token}`,
    },
  });
  assert.equal(staleBearerResponse.status, 401);

  const newTokenResponse = await fetch("http://127.0.0.1:8901/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "tenant-disabled-client",
      client_secret: "tenant-disabled-secret",
      scope: "catalog:read",
      resource: "http://127.0.0.1:8901/v1",
    }),
  });
  assert.equal(newTokenResponse.status, 403);

  await server.close();
  await close();
});

test("tenant-scoped backups export and restore only the caller tenant", async () => {
  const { app, broker, close } = await makeTestApp({
    catalog: {
      version: 1,
      credentials: [
        {
          id: "tenant-a-backup-demo",
          tenantId: "tenant-a",
          displayName: "Tenant A Backup Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "moderate",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Tenant A backup record",
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
        {
          id: "tenant-b-backup-demo",
          tenantId: "tenant-b",
          displayName: "Tenant B Backup Demo",
          service: "github",
          owner: "platform",
          scopeTier: "read_only",
          sensitivity: "moderate",
          allowedDomains: ["localhost"],
          permittedOperations: ["http.get"],
          expiresAt: null,
          rotationPolicy: "30 days",
          lastValidatedAt: null,
          selectionNotes: "Tenant B backup record",
          binding: {
            adapter: "env",
            ref: "KEYLORE_TEST_SECRET",
            authType: "bearer",
            headerName: "Authorization",
            headerPrefix: "Bearer ",
          },
          tags: ["tenant-b"],
          status: "active",
        },
      ],
    },
    policies: {
      version: 1,
      rules: [],
    },
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
    configOverrides: {
      httpPort: 8902,
      publicBaseUrl: "http://127.0.0.1:8902",
      oauthIssuerUrl: "http://127.0.0.1:8902/oauth",
    },
  });
  const server = await startHttpServer(app);

  const backupTokenResponse = await fetch("http://127.0.0.1:8902/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: "tenant-a-backup",
      client_secret: "tenant-a-backup-secret",
      scope: "backup:read backup:write",
      resource: "http://127.0.0.1:8902/v1",
    }),
  });
  assert.equal(backupTokenResponse.status, 200);
  const backupToken = (await backupTokenResponse.json()) as { access_token: string };

  const exportResponse = await fetch("http://127.0.0.1:8902/v1/system/backups/export", {
    method: "POST",
    headers: {
      authorization: `Bearer ${backupToken.access_token}`,
    },
  });
  assert.equal(exportResponse.status, 200);
  const exportBody = (await exportResponse.json()) as {
    backup: {
      tenants: Array<{ tenantId: string }>;
      credentials: Array<{ id: string; tenantId: string }>;
    };
    summary: { tenants: number; credentials: number };
  };
  assert.equal(exportBody.summary.tenants, 1);
  assert.equal(exportBody.summary.credentials, 1);
  assert.deepEqual(exportBody.backup.tenants.map((tenant) => tenant.tenantId), ["tenant-a"]);
  assert.deepEqual(exportBody.backup.credentials.map((credential) => credential.id), ["tenant-a-backup-demo"]);

  await broker.deleteCredential(localOperatorContext("local-operator"), "tenant-a-backup-demo");
  assert.equal(
    (await broker.getCredential(localOperatorContext("local-operator"), "tenant-a-backup-demo")) === undefined,
    true,
  );
  assert.equal(
    (await broker.getCredential(localOperatorContext("local-operator"), "tenant-b-backup-demo"))?.id,
    "tenant-b-backup-demo",
  );

  const restoreResponse = await fetch("http://127.0.0.1:8902/v1/system/backups/restore", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${backupToken.access_token}`,
    },
    body: JSON.stringify({
      confirm: true,
      backup: exportBody.backup,
    }),
  });
  assert.equal(restoreResponse.status, 200);
  assert.equal(
    (await broker.getCredential(localOperatorContext("local-operator"), "tenant-a-backup-demo"))?.id,
    "tenant-a-backup-demo",
  );
  assert.equal(
    (await broker.getCredential(localOperatorContext("local-operator"), "tenant-b-backup-demo"))?.id,
    "tenant-b-backup-demo",
  );

  const mixedRestoreResponse = await fetch("http://127.0.0.1:8902/v1/system/backups/restore", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${backupToken.access_token}`,
    },
    body: JSON.stringify({
      confirm: true,
      backup: {
        ...exportBody.backup,
        tenants: [
          ...exportBody.backup.tenants,
          {
            ...(exportBody.backup.tenants[0] as Record<string, unknown>),
            tenantId: "tenant-b",
          },
        ],
      },
    }),
  });
  assert.equal(mixedRestoreResponse.status, 403);

  await server.close();
  await close();
});
