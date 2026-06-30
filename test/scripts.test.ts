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
});
