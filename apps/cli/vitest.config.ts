import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import path from "node:path";

const nodeSqlite = createRequire(
  path.resolve(__dirname, "../collaboration-server/package.json")
).resolve("better-sqlite3");

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    alias: {
      "better-sqlite3": nodeSqlite,
      "sqlite-vec": createRequire(path.resolve(__dirname, "package.json")).resolve("sqlite-vec"),
    },
  },
});
