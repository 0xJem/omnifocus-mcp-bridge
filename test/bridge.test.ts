import path from "node:path";
import { fileURLToPath } from "node:url";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadConfig } from "../src/config.js";
import { startBridge, type BridgeRuntime } from "../src/server.js";
import { connectUpstream, type UpstreamConnection } from "../src/upstream.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fakeUpstreamPath = path.join(__dirname, "fixtures", "fake-upstream.mjs");

let runtime: BridgeRuntime | undefined;
let upstream: UpstreamConnection | undefined;

afterEach(async () => {
  if (runtime) {
    await runtime.close();
    runtime = undefined;
    upstream = undefined;
  } else if (upstream) {
    await upstream.close();
    upstream = undefined;
  }
});

describe("config", () => {
  test("fails closed when the bearer token is missing", () => {
    expect(() =>
      loadConfig({
        OMNIFOCUS_MCP_TOKEN: "",
      }),
    ).toThrow(/OMNIFOCUS_MCP_TOKEN or OMNIFOCUS_MCP_TOKEN_FILE is required/);
  });

  test("defaults remote access to read-only mode", () => {
    const config = loadConfig({
      OMNIFOCUS_MCP_TOKEN: "test-token",
    });

    expect(config.readOnly).toBe(true);
  });

  test("loads non-secret config from .env and bearer token from a private file", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "omnifocus-bridge-"));
    const tokenPath = path.join(tempDir, "token");
    await writeFile(tokenPath, "file-token\n", { mode: 0o600 });
    await writeFile(
      path.join(tempDir, ".env"),
      [
        `OMNIFOCUS_MCP_TOKEN_FILE=${tokenPath}`,
        "OMNIFOCUS_MCP_HOST=100.64.0.10",
        "OMNIFOCUS_MCP_PORT=4444",
        "OMNIFOCUS_MCP_READ_ONLY=false",
      ].join("\n"),
    );

    const config = loadConfig({}, { cwd: tempDir });

    expect(config.token).toBe("file-token");
    expect(config.host).toBe("100.64.0.10");
    expect(config.port).toBe(4444);
    expect(config.readOnly).toBe(false);
  });

  test("environment variables override .env values", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "omnifocus-bridge-"));
    const tokenPath = path.join(tempDir, "token");
    await writeFile(tokenPath, "file-token\n", { mode: 0o600 });
    await writeFile(
      path.join(tempDir, ".env"),
      [`OMNIFOCUS_MCP_TOKEN_FILE=${tokenPath}`, "OMNIFOCUS_MCP_PORT=4444"].join("\n"),
    );

    const config = loadConfig(
      {
        OMNIFOCUS_MCP_TOKEN: "env-token",
        OMNIFOCUS_MCP_PORT: "5555",
      },
      { cwd: tempDir },
    );

    expect(config.token).toBe("env-token");
    expect(config.port).toBe(5555);
  });

  test("resolves a relative token file path from an explicit env file directory", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "omnifocus-bridge-"));
    const envPath = path.join(tempDir, "bridge.env");
    const tokenPath = path.join(tempDir, ".secrets", "token");
    await mkdir(path.dirname(tokenPath));
    await writeFile(tokenPath, "relative-file-token\n", { mode: 0o600 });
    await writeFile(envPath, "OMNIFOCUS_MCP_TOKEN_FILE=.secrets/token\n");

    const config = loadConfig(
      {
        OMNIFOCUS_MCP_ENV_FILE: envPath,
      },
      { cwd: tmpdir() },
    );

    expect(config.token).toBe("relative-file-token");
  });

  test("rejects token files that are group or world readable", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "omnifocus-bridge-"));
    const tokenPath = path.join(tempDir, "token");
    await writeFile(tokenPath, "file-token\n");
    await chmod(tokenPath, 0o644);

    expect(() =>
      loadConfig({
        OMNIFOCUS_MCP_TOKEN_FILE: tokenPath,
      }),
    ).toThrow(/must not be group\/world readable/);
  });
});

describe("upstream child process", () => {
  test("launches a stdio MCP child process", async () => {
    upstream = await connectUpstream(process.execPath, [fakeUpstreamPath]);

    expect(upstream.transport.pid).toEqual(expect.any(Number));
    const tools = await upstream.client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toContain("dump_database");
  });
});

describe("bridge server", () => {
  test("starts on the configured host and port", async () => {
    runtime = await startTestBridge();

    expect(runtime.url.hostname).toBe("127.0.0.1");
    expect(Number(runtime.url.port)).toBeGreaterThan(0);
  });

  test("rejects requests without valid bearer auth", async () => {
    runtime = await startTestBridge();

    const response = await fetch(runtime.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: {
            name: "smoke",
            version: "0.0.0",
          },
        },
      }),
    });

    expect(response.status).toBe(401);
  });

  test("accepts valid bearer auth and exposes read-only tools only", async () => {
    runtime = await startTestBridge();
    const client = new Client({
      name: "bridge-smoke",
      version: "0.0.0",
    });
    const transport = new StreamableHTTPClientTransport(runtime.url, {
      requestInit: {
        headers: {
          authorization: "Bearer test-token",
        },
      },
    });

    await client.connect(transport);
    const tools = await client.listTools();
    await client.close();

    expect(tools.tools.map((tool) => tool.name)).toEqual(["dump_database"]);
  });

  test("rejects mutating tool calls while read-only mode is enabled", async () => {
    runtime = await startTestBridge();
    const client = new Client({
      name: "bridge-smoke",
      version: "0.0.0",
    });
    const transport = new StreamableHTTPClientTransport(runtime.url, {
      requestInit: {
        headers: {
          authorization: "Bearer test-token",
        },
      },
    });

    await client.connect(transport);
    await expect(client.callTool({ name: "add_omnifocus_task", arguments: {} })).rejects.toThrow(
      /not available while OMNIFOCUS_MCP_READ_ONLY is enabled/,
    );
    await client.close();
  });
});

async function startTestBridge(): Promise<BridgeRuntime> {
  upstream = await connectUpstream(process.execPath, [fakeUpstreamPath]);
  return startBridge(
    {
      token: "test-token",
      host: "127.0.0.1",
      port: 0,
      readOnly: true,
      upstreamCommand: process.execPath,
      upstreamArgs: [fakeUpstreamPath],
      upstreamBinPath: fakeUpstreamPath,
    },
    upstream,
  );
}
