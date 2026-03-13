import { createKeyLoreApp } from "./app.js";
import { startHttpServer } from "./http/server.js";
import { runStdioServer } from "./mcp/stdio.js";

function readTransportArg(argv: string[]): "http" | "stdio" {
  const transportIndex = argv.findIndex((value) => value === "--transport");
  if (transportIndex >= 0) {
    const value = argv[transportIndex + 1];
    if (value === "http" || value === "stdio") {
      return value;
    }
  }

  const inline = argv.find((value) => value.startsWith("--transport="));
  if (inline) {
    const [, value] = inline.split("=", 2);
    if (value === "http" || value === "stdio") {
      return value;
    }
  }

  return "http";
}

async function main(): Promise<void> {
  const app = await createKeyLoreApp();
  const transport = readTransportArg(process.argv.slice(2));

  if (transport === "stdio") {
    await runStdioServer(app);
    return;
  }

  const server = await startHttpServer(app);

  const shutdown = async () => {
    await server.close();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
