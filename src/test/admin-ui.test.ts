import assert from "node:assert/strict";
import test from "node:test";

import { startHttpServer } from "../http/server.js";
import { makeTestApp } from "./helpers.js";

test("admin ui is served over HTTP without requiring a bearer token", async () => {
  const { app, close } = await makeTestApp({
    configOverrides: {
      httpPort: 8907,
      publicBaseUrl: "http://127.0.0.1:8907",
      oauthIssuerUrl: "http://127.0.0.1:8907/oauth",
      localQuickstartEnabled: true,
      localAdminBootstrap: {
        clientId: "keylore-admin-local",
        clientSecret: "keylore-local-admin",
        scopes: ["catalog:read", "admin:read"],
      },
    },
  });
  const server = await startHttpServer(app);

  try {
    const response = await fetch("http://127.0.0.1:8907/admin");
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);

    const html = await response.text();
    assert.match(html, /KeyLore Admin/);
    assert.match(html, /Create credential/);
    assert.match(html, /Test credential/);
    assert.match(html, /Local encrypted store/);
    assert.match(html, /Open operator session/);
    assert.match(html, /Use local admin quickstart/);
    assert.match(html, /Refresh everything/);
    assert.match(html, /1\.0\.0-rc4/);
  } finally {
    await server.close();
    await close();
  }
});
