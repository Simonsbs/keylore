#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

const binDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeEntryPath = path.resolve(binDir, "../dist/index.js");
const serviceManagerPath = path.resolve(binDir, "../dist/http-service.js");

const { runHttpServiceCommand } = await import(serviceManagerPath);
const exitCode = await runHttpServiceCommand(process.argv.slice(2), runtimeEntryPath);
process.exit(exitCode);
