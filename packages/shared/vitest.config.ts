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
      "@tau/shared/chat-core": path.resolve(__dirname, "./chat-core.ts"),
      "@tau/shared": path.resolve(__dirname, "./src"),
    },
  },
});
