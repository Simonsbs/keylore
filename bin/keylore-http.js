#!/usr/bin/env node
process.argv.push("--transport", "http");
await import("../dist/index.js");
