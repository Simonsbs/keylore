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
    assert.match(html, /Start here/);
    assert.match(html, /Save token/);
    assert.match(html, /Test credential/);
    assert.match(html, /What the AI will see/);
    assert.match(html, /Writing help/);
    assert.match(html, /Connect your AI tool/);
    assert.match(html, /Codex local setup/);
    assert.match(html, /Gemini local setup/);
    assert.match(html, /GitHub write-capable/);
    assert.match(html, /npm read-only/);
    assert.match(html, /Internal service token/);
    assert.match(html, /Advanced token settings/);
    assert.match(html, /Inspect or edit AI-facing context/);
    assert.match(html, /Current AI-visible record/);
    assert.match(html, /Save context changes/);
    assert.match(html, /First prompt to try in Codex/);
    assert.match(html, /First prompt to try in Gemini/);
    assert.match(html, /More actions/);
    assert.match(html, /Rename/);
    assert.match(html, /Retag/);
    assert.match(html, /Archive/);
    assert.match(html, /Show advanced controls/);
    assert.match(html, /Advanced mode is optional/);
    assert.match(html, /Local encrypted store/);
    assert.match(html, /Open operator session/);
    assert.match(html, /Start working locally/);
    assert.match(html, /open a local session automatically/);
    assert.match(html, /Manual sign-in options/);
    assert.match(html, /Remote or advanced connection options/);
    assert.match(html, /Refresh everything/);
    assert.match(html, /1\.0\.0-rc4/);
  } finally {
    await server.close();
    await close();
  }
});
