import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pluginRoot = join(import.meta.dirname, "..", "..");
const read = (relativePath: string): string =>
  readFileSync(join(pluginRoot, relativePath), "utf8");

const sdkValueImport =
  /import\s+(?!type\s)[^;]*?from\s*["']@get-bb\/plugin-sdk["']/;

describe("frontend bundle graph", () => {
  it("contract.ts imports the SDK for types only", () => {
    const source = read("contract.ts");
    expect(source).toContain("@get-bb/plugin-sdk");
    expect(sdkValueImport.test(source)).toBe(false);
  });

  it("keeps the SDK out of runtime dependencies", () => {
    const manifest = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.dependencies?.["@get-bb/plugin-sdk"]).toBeUndefined();
    expect(manifest.devDependencies?.["@get-bb/plugin-sdk"]).toBeDefined();
  });

  it("no panel-side module imports the SDK as a value", () => {
    for (const file of [
      "app.tsx",
      "lib/fm-rpc.ts",
      "lib/start-folder.ts",
      "lib/fm-store.ts",
      "lib/fm-pathbar.ts",
      "lib/last-folder.ts",
      "components/PathBar.tsx",
    ]) {
      expect(sdkValueImport.test(read(file))).toBe(false);
    }
  });
});
