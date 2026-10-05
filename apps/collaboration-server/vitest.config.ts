import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      "better-sqlite3": require.resolve("better-sqlite3"),
    },
  },
  test: {
    environment: "node",
    // 被 desktop 的 electron-rebuild 覆盖成 Electron ABI 时先恢复（部署前的测试也走这里）
    globalSetup: ["../../scripts/ensure-node-sqlite.mjs"],
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
  },
});
