import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { EnvSecretAdapter } from "../adapters/env-secret-adapter.js";
import { KeyLoreConfig } from "../config.js";
import { CatalogFile, PolicyFile } from "../domain/types.js";
import { JsonCredentialRepository } from "../repositories/credential-repository.js";
import { JsonPolicyRepository } from "../repositories/policy-repository.js";
import { AuditLogService } from "../services/audit-log.js";
import { BrokerService } from "../services/broker-service.js";
import { PolicyEngine } from "../services/policy-engine.js";

async function makeBroker() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "keylore-test-"));
  const catalogPath = path.join(tempDir, "catalog.json");
  const policyPath = path.join(tempDir, "policies.json");
  const auditPath = path.join(tempDir, "audit.ndjson");

  const catalog: CatalogFile = {
    version: 1,
    credentials: [
      {
        id: "demo",
        displayName: "Demo",
        service: "github",
        owner: "platform",
        scopeTier: "read_only",
        sensitivity: "high",
        allowedDomains: ["localhost"],
        permittedOperations: ["http.get"],
        expiresAt: null,
        rotationPolicy: "90 days",
        lastValidatedAt: null,
        selectionNotes: "Demo credential",
        binding: {
          adapter: "env",
          ref: "KEYLORE_TEST_SECRET",
          authType: "bearer",
          headerName: "Authorization",
          headerPrefix: "Bearer ",
        },
        tags: ["demo"],
        status: "active",
      },
    ],
  };

  const policies: PolicyFile = {
    version: 1,
    rules: [
      {
        id: "allow-demo",
        effect: "allow",
        description: "Allow local reads",
        principals: ["local-operator"],
        credentialIds: ["demo"],
        operations: ["http.get"],
        domainPatterns: ["localhost"],
        environments: ["test"],
      },
    ],
  };

  await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
  await fs.writeFile(policyPath, `${JSON.stringify(policies, null, 2)}\n`);

  const config: KeyLoreConfig = {
    appName: "keylore",
    version: "0.1.0",
    dataDir: tempDir,
    catalogPath,
    policyPath,
    auditPath,
    httpHost: "127.0.0.1",
    httpPort: 8787,
    environment: "test",
    defaultPrincipal: "local-operator",
    mcpBearerToken: undefined,
    logLevel: "silent",
  };

  const broker = new BrokerService(
    new JsonCredentialRepository(catalogPath),
    new JsonPolicyRepository(policyPath),
    new AuditLogService(auditPath),
    new EnvSecretAdapter(),
    new PolicyEngine(),
    config,
  );

  return { broker, tempDir };
}

test("catalog search does not expose secret bindings", async () => {
  const { broker, tempDir } = await makeBroker();
  const results = await broker.searchCatalog("local-operator", { query: "demo", limit: 10 });
  const first = results.at(0);

  assert.equal(results.length, 1);
  assert.ok(first);
  assert.equal("binding" in first, false);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("access request is denied when the target domain is not allowlisted", async () => {
  const { broker, tempDir } = await makeBroker();

  const result = await broker.requestAccess("local-operator", {
    credentialId: "demo",
    operation: "http.get",
    targetUrl: "https://api.github.com/repos/modelcontextprotocol/specification",
  });

  assert.equal(result.decision, "denied");
  assert.match(result.reason, /allowlisted|allow rule/i);

  await fs.rm(tempDir, { recursive: true, force: true });
});

test("audit log records credential search events", async () => {
  const { broker, tempDir } = await makeBroker();
  await broker.searchCatalog("local-operator", { limit: 10 });
  const events = await broker.listRecentAuditEvents(5);

  assert.equal(events[0]?.type, "catalog.search");

  await fs.rm(tempDir, { recursive: true, force: true });
});
