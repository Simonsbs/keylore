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
    assert.match(html, /Quick start/);
    assert.match(html, /Your tokens/);
    assert.match(html, /Add token/);
    assert.match(html, /Token key/);
    assert.match(html, /Replace stored token \(optional\)|Paste token/);
    assert.match(html, /Test credential/);
    assert.match(html, /What the AI will see/);
    assert.match(html, /Connect your AI tool/);
    assert.match(html, /Codex/);
    assert.match(html, /Gemini CLI/);
    assert.match(html, /Claude CLI/);
    assert.match(html, /~\/\.codex\/config\.toml/);
    assert.match(html, /~\/\.gemini\/settings\.json/);
    assert.match(html, /claude mcp list/);
    assert.match(html, /Apply to my Codex settings/);
    assert.match(html, /Apply to my Gemini settings/);
    assert.match(html, /Apply to my Claude settings/);
    assert.match(html, /data-connect-tab="codex"/);
    assert.match(html, /data-copy-target="codex-stdio-snippet"/);
    assert.match(html, /Where to store the token/);
    assert.match(html, /Service name/);
    assert.match(html, /Risk level/);
    assert.match(html, /Allow writes\?/);
    assert.match(html, /Explain this token for people/);
    assert.match(html, /Tell the AI when to use this token/);
    assert.doesNotMatch(html, /Writing help/);
    assert.match(html, /Token to check/);
    assert.match(html, /URL to call with this token/);
    assert.match(html, /Check this token/);
    assert.match(html, /First prompt to try/);
    assert.doesNotMatch(html, /First prompt to try in Codex/);
    assert.doesNotMatch(html, /First prompt to try in Gemini/);
    assert.doesNotMatch(html, /First prompt to try in Claude/);
    assert.match(html, /Edit token/);
    assert.match(html, /Use in test/);
    assert.match(html, /Archive/);
    assert.match(html, /Delete/);
    assert.match(html, /Show advanced controls/);
    assert.match(html, /Advanced mode is optional/);
    assert.match(html, /Local encrypted store/);
    assert.match(html, /Open operator session/);
    assert.match(html, /Start working locally/);
    assert.match(html, /open a local session automatically/);
    assert.match(html, /Manual sign-in options/);
    assert.match(html, /Remote or advanced connection options/);
    assert.match(html, /1\.0\.0-rc5/);
  } finally {
    await server.close();
    await close();
  }
});
