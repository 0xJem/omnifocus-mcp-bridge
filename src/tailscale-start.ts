#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { parseRuntimeArgs } from "./runtime-args.js";
import { startBridge } from "./server.js";
import {
  buildTailscaleServeArgs,
  checkTailscaleServePathAvailable,
  startTailscaleServe,
  TAILSCALE_SERVE_PATH,
} from "./tailscale.js";
import { connectUpstream } from "./upstream.js";

export async function run(args: string[] = process.argv.slice(2)): Promise<void> {
  const runtimeArgs = parseRuntimeArgs(args);
  const config = loadConfig(process.env, {
    verbose: runtimeArgs.verbose,
  });
  if (config.host !== "127.0.0.1" && config.host !== "localhost") {
    throw new Error("Tailscale Serve mode requires OMNIFOCUS_MCP_HOST=127.0.0.1.");
  }

  checkTailscaleServePathAvailable();

  const upstream = await connectUpstream(config.upstreamCommand, config.upstreamArgs);
  const runtime = await startBridge(config, upstream);
  const serveArgs = buildTailscaleServeArgs(runtime);

  console.error(
    `omnifocus-mcp-bridge local=${runtime.url.href} readOnly=${String(config.readOnly)} verbose=${String(config.verbose)} upstreamBin=${config.upstreamBinPath}`,
  );
  console.error(
    `tailscale serve path=${TAILSCALE_SERVE_PATH} command=tailscale ${serveArgs.join(" ")}`,
  );

  const tailscale = startTailscaleServe(runtime);
  let shuttingDown = false;

  const shutdown = async (exitCode: number) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    tailscale.kill("SIGTERM");
    await runtime.close();
    process.exit(exitCode);
  };

  process.once("SIGINT", () => {
    void shutdown(0);
  });
  process.once("SIGTERM", () => {
    void shutdown(0);
  });

  tailscale.once("exit", (code, signal) => {
    const exitCode = code ?? (signal === null ? 0 : 1);
    void shutdown(exitCode);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
