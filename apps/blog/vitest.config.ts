import { defineConfig, mergeConfig } from "vitest/config";
import { resolve } from "path";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
    },
    resolve: {
      alias: {
        "./tikzjax.js": resolve(__dirname, "./src/test-mocks/tikzjax.ts"),
      },
    },
  }),
);
