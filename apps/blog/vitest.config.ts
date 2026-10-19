import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  {
    ...viteConfig,
    plugins: viteConfig.plugins
      ?.flat()
      .filter(
        plugin =>
          !(
            plugin &&
            typeof plugin === "object" &&
            "name" in plugin &&
            typeof plugin.name === "string" &&
            plugin.name.startsWith("@tailwindcss/vite")
          )
      ),
  },
  defineConfig({
    test: {
      environment: "jsdom",
    },
  })
);
