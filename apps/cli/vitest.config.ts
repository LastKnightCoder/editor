import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import path from "node:path";
import { readFileSync } from "node:fs";

const nodeSqlite = createRequire(
  path.resolve(__dirname, "../collaboration-server/package.json")
).resolve("better-sqlite3");

export default defineConfig({
  define: {
    __TAU_CLIENT_VERSION__: JSON.stringify(
      JSON.parse(readFileSync(new URL("../desktop/package.json", import.meta.url), "utf8")).version
    ),
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
  resolve: {
    alias: {
      "better-sqlite3": nodeSqlite,
      "sqlite-vec": createRequire(path.resolve(__dirname, "package.json")).resolve("sqlite-vec"),
    },
  },
});
