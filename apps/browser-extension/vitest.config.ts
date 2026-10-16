import { defineConfig } from "vitest/config";
import path from "path";
import { portablePluginBuild } from "@tau/plugins/distribution";

export default defineConfig({
  plugins: [portablePluginBuild(path.resolve(__dirname, "../../plugins/distribution.json"))],
  test: {
    environment: "jsdom",
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
      "@tau/editor": path.resolve(__dirname, "../../packages/editor"),
      "./tikzjax.js": path.resolve(__dirname, "./src/test-mocks/tikzjax.ts"),
    },
  },
});
