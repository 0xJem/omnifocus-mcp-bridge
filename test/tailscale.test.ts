import { describe, expect, test } from "vitest";
import type { BridgeRuntime } from "../src/server.js";
import {
  assertTailscalePathAvailable,
  buildTailscaleServeArgs,
  TAILSCALE_SERVE_PATH,
} from "../src/tailscale.js";

describe("tailscale serve integration", () => {
  test("builds a foreground serve command for the fixed OmniFocus path", () => {
    const runtime = {
      url: new URL("http://127.0.0.1:3050/mcp"),
    } as BridgeRuntime;

    expect(buildTailscaleServeArgs(runtime)).toEqual([
      "serve",
      "--set-path",
      TAILSCALE_SERVE_PATH,
      "http://127.0.0.1:3050/mcp",
    ]);
  });

  test("allows existing serve config on unrelated paths", () => {
    const status = JSON.stringify({
      Web: {
        "example.tailnet.ts.net:443": {
          Handlers: {
            "/grafana": {
              Proxy: "http://127.0.0.1:3000",
            },
          },
        },
      },
    });

    expect(() => assertTailscalePathAvailable(status)).not.toThrow();
  });

  test("rejects an existing omnifocus-mcp serve path", () => {
    const status = JSON.stringify({
      Web: {
        "example.tailnet.ts.net:443": {
          Handlers: {
            "/omnifocus-mcp": {
              Proxy: "http://127.0.0.1:3050/mcp",
            },
          },
        },
      },
    });

    expect(() => assertTailscalePathAvailable(status)).toThrow(
      /path \/omnifocus-mcp is already configured/,
    );
  });
});
