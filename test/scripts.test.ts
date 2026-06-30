import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

describe("runner scripts", () => {
  test.each([
    "run-server.sh",
    "run-tailscale.sh",
    "generate-token.sh",
  ])("%s rebuilds before executing compiled output", async (scriptName) => {
    const script = await readFile(path.join(repoRoot, "scripts", scriptName), "utf8");

    expect(script).toContain("pnpm run build");
    expect(script).not.toMatch(/if \[ ! -f dist\//);
  });

  test("launch agent template uses the com.0xjem service shape", async () => {
    const template = await readFile(
      path.join(repoRoot, "launchd", "com.0xjem.omnifocus-mcp-bridge.plist.template"),
      "utf8",
    );

    expect(template).toContain("<string>__LABEL__</string>");
    expect(template).toContain("<string>__REPO_ROOT__</string>");
    expect(template).toContain("<string>__PNPM__</string>");
    expect(template).toContain("<string>start:tailscale</string>");
    expect(template).toContain("<key>RunAtLoad</key>");
    expect(template).toContain("<key>KeepAlive</key>");
  });

  test("launch agent installer renders and manages a user LaunchAgent", async () => {
    const script = await readFile(
      path.join(repoRoot, "scripts", "install-launch-agent.sh"),
      "utf8",
    );

    expect(script).toContain('LABEL="com.0xjem.omnifocus-mcp-bridge"');
    expect(script).toContain("$HOME/Library/LaunchAgents/$LABEL.plist");
    expect(script).toContain("launchctl bootstrap");
    expect(script).toContain("launchctl kickstart -k");
    expect(script).not.toContain("com.jhiggs");
  });
});
