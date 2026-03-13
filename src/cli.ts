#!/usr/bin/env node
import { createKeyLoreApp } from "./app.js";
import { runCli } from "./cli/run.js";

async function main(): Promise<void> {
  const app = await createKeyLoreApp();
  try {
    const result = await runCli(app, process.argv.slice(2));
    process.stdout.write(result);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
