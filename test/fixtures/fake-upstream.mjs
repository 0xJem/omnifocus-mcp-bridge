#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "fake-omnifocus-upstream",
  version: "0.0.0",
});

server.tool("dump_database", "Read fake OmniFocus data", async () => ({
  content: [
    {
      type: "text",
      text: "fake database",
    },
  ],
}));

server.tool("add_omnifocus_task", "Mutate fake OmniFocus data", async () => ({
  content: [
    {
      type: "text",
      text: "created",
    },
  ],
}));

await server.connect(new StdioServerTransport());
