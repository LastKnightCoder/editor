import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/admin.ts", "src/checkpoint-worker.ts"],
  format: "esm",
  platform: "node",
  target: "node24",
  outDir: "dist",
  splitting: false,
  noExternal: ["@tau/collaboration"],
});
