import { defineConfig } from "vitest/config";
import { portablePluginBuild } from "@tau/plugins/distribution";
import path from "node:path";

export default defineConfig({
  plugins: [portablePluginBuild(path.resolve(__dirname, "../../plugins/distribution.json"))],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
