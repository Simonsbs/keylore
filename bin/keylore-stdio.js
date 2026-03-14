#!/usr/bin/env node
process.argv.push("--transport", "stdio");
await import("../dist/index.js");
