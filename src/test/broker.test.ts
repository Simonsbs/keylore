import assert from "node:assert/strict";
import test from "node:test";

import { localOperatorContext } from "../services/auth-context.js";
import { makeTestApp } from "./helpers.js";

test("catalog search does not expose secret bindings", async () => {
  const { broker, close } = await makeTestApp();
  const results = await broker.searchCatalog(localOperatorContext("local-operator"), {
    query: "demo",
    limit: 10,
  });
  const first = results.at(0);

  assert.equal(results.length, 1);
  assert.ok(first);
  assert.equal("binding" in first, false);

  await close();
});

test("access request is denied when the target domain is not allowlisted", async () => {
  const { broker, close } = await makeTestApp();

  const result = await broker.requestAccess(localOperatorContext("local-operator"), {
    credentialId: "demo",
    operation: "http.get",
    targetUrl: "https://api.github.com/repos/modelcontextprotocol/specification",
  });

  assert.equal(result.decision, "denied");
  assert.match(result.reason, /allowlisted|allow rule/i);

  await close();
});

test("audit log records credential search events", async () => {
  const { broker, close } = await makeTestApp();
  await broker.searchCatalog(localOperatorContext("local-operator"), { limit: 10 });
  const events = await broker.listRecentAuditEvents(localOperatorContext("local-operator"), 5);

  assert.equal(events[0]?.type, "catalog.search");

  await close();
});
