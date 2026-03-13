#!/usr/bin/env node
import { createKeyLoreApp } from "./app.js";
import { runCli } from "./cli/run.js";

async function main(): Promise<void> {
  const app = await createKeyLoreApp();
  const result = await runCli(app, process.argv.slice(2));
  process.stdout.write(result);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
