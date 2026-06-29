#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { startBridge } from "./server.js";
import { connectUpstream } from "./upstream.js";

export async function run(): Promise<void> {
  const config = loadConfig();
  const upstream = await connectUpstream(config.upstreamCommand, config.upstreamArgs);
  const runtime = await startBridge(config, upstream);

  console.error(
    `omnifocus-mcp-bridge listening on ${runtime.url.href} readOnly=${String(config.readOnly)} upstreamBin=${config.upstreamBinPath}`,
  );

  const shutdown = async () => {
    await runtime.close();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
