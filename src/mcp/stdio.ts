import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { KeyLoreApp } from "../app.js";
import { createKeyLoreMcpServer } from "./create-server.js";

export async function runStdioServer(app: KeyLoreApp): Promise<void> {
  const server = createKeyLoreMcpServer(app);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
