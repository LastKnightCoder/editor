import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tau/shared": path.resolve(__dirname, "../shared"),
      // 单测环境不需要执行 tikzjax 副作用
      "./tikzjax.js": path.resolve(
        __dirname,
        "../../apps/desktop/src/test-mocks/tikzjax.ts",
      ),
    },
  },
});
