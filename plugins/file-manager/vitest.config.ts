import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    silent: "passed-only",
    name: "bb-plugin-bb--file-manager",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**"],
    testTimeout: 20_000,
    setupFiles: ["./vitest.setup.ts"],
  },
});
