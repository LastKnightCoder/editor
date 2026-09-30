import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom" },
  resolve: {
    alias: {
      "./tikzjax.js": path.resolve(__dirname, "../../apps/desktop/src/test-mocks/tikzjax.ts"),
    },
  },
});
