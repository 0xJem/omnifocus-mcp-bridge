import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fakeUpstreamPath = path.join(__dirname, "fixtures", "fake-upstream.mjs");

let bridgeProcess: ChildProcessWithoutNullStreams | undefined;

afterEach(async () => {
  if (bridgeProcess) {
    await stopProcess(bridgeProcess);
    bridgeProcess = undefined;
  }
});

describe("packaged bridge integration", () => {
  test("starts via pnpm start and serves MCP over authenticated HTTP", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "omnifocus-bridge-integration-"));
    const tokenPath = path.join(tempDir, ".secrets", "token");
    const envPath = path.join(tempDir, ".env");
    await mkdir(path.dirname(tokenPath));
    await writeFile(tokenPath, "integration-token\n", { mode: 0o600 });
    await writeFile(
      envPath,
      [
        `OMNIFOCUS_MCP_TOKEN_FILE=${tokenPath}`,
        "OMNIFOCUS_MCP_HOST=127.0.0.1",
        "OMNIFOCUS_MCP_PORT=0",
        "OMNIFOCUS_MCP_READ_ONLY=true",
        `OMNIFOCUS_MCP_UPSTREAM_COMMAND=${process.execPath}`,
        `OMNIFOCUS_MCP_UPSTREAM_ARGS=${JSON.stringify([fakeUpstreamPath])}`,
      ].join("\n"),
    );

    bridgeProcess = spawn("pnpm", ["start"], {
      cwd: repoRoot,
      env: {
        ...withoutOmniFocusEnv(process.env),
        OMNIFOCUS_MCP_ENV_FILE: envPath,
      },
    });

    const bridgeUrl = await waitForBridgeUrl(bridgeProcess);
    const client = new Client({
      name: "integration-test-client",
      version: "0.0.0",
    });
    const transport = new StreamableHTTPClientTransport(bridgeUrl, {
      requestInit: {
        headers: {
          authorization: "Bearer integration-token",
        },
      },
    });

    await client.connect(transport);
    const tools = await client.listTools();
    await client.close();

    expect(tools.tools.map((tool) => tool.name)).toEqual(["dump_database"]);
  }, 30_000);
});

function withoutOmniFocusEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !key.startsWith("OMNIFOCUS_MCP_")),
  );
}

async function waitForBridgeUrl(child: ChildProcessWithoutNullStreams): Promise<URL> {
  let output = "";

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for bridge startup. Output:\n${output}`));
    }, 20_000);

    const onData = (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const match = output.match(/omnifocus-mcp-bridge listening on (http:\/\/\S+)/);
      if (match) {
        cleanup();
        resolve(new URL(match[1]));
      }
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      cleanup();
      reject(
        new Error(
          `Bridge exited before startup. code=${String(code)} signal=${String(signal)}\n${output}`,
        ),
      );
    };

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

async function stopProcess(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
