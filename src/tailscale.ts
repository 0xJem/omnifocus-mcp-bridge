import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { BridgeRuntime } from "./server.js";

export const TAILSCALE_SERVE_PATH = "/omnifocus-mcp";

export type TailscaleServeOptions = {
  tailscaleCommand?: string;
};

export function buildTailscaleServeArgs(runtime: BridgeRuntime): string[] {
  return ["serve", "--set-path", TAILSCALE_SERVE_PATH, runtime.url.href];
}

export function assertTailscalePathAvailable(
  statusOutput: string,
  path: string = TAILSCALE_SERVE_PATH,
): void {
  const normalizedPath = normalizePath(path);
  const parsed = parseStatusOutput(statusOutput);
  if (containsPath(parsed, normalizedPath)) {
    throw new Error(
      `Tailscale Serve path ${normalizedPath} is already configured. Refusing to overwrite it.`,
    );
  }
}

export function checkTailscaleServePathAvailable(tailscaleCommand: string = "tailscale"): void {
  const status = spawnSync(tailscaleCommand, ["serve", "status", "--json"], {
    encoding: "utf8",
  });

  if (status.error) {
    throw status.error;
  }

  if (status.status !== 0) {
    const output = `${status.stdout ?? ""}${status.stderr ?? ""}`.trim();
    throw new Error(output || `tailscale serve status exited with ${String(status.status)}`);
  }

  assertTailscalePathAvailable(status.stdout ?? "");
}

export function startTailscaleServe(
  runtime: BridgeRuntime,
  options: TailscaleServeOptions = {},
): ChildProcess {
  const tailscaleCommand = options.tailscaleCommand ?? "tailscale";
  return spawn(tailscaleCommand, buildTailscaleServeArgs(runtime), {
    stdio: "inherit",
  });
}

function parseStatusOutput(output: string): unknown {
  if (output.trim() === "") {
    return {};
  }

  try {
    return JSON.parse(output) as unknown;
  } catch {
    return output;
  }
}

function containsPath(value: unknown, path: string): boolean {
  if (typeof value === "string") {
    return value === path || value.includes(path);
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsPath(item, path));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, child]) => {
      return normalizePath(key) === path || containsPath(child, path);
    });
  }

  return false;
}

function normalizePath(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}
