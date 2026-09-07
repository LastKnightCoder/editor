import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
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
      "@tau/shared": path.resolve(__dirname, "./src"),
    },
  },
});
