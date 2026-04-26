import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    deps: {
      optimizer: {
        web: {
          include: ["vitest-canvas-mock"],
        },
      },
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
    environmentOptions: {
      jsdom: {
        resources: "usable",
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tau/agent": path.resolve(__dirname, "../../packages/agent"),
      "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
      "@tau/editor": path.resolve(__dirname, "../../packages/editor"),
      "@tau/db-schema": path.resolve(__dirname, "../../packages/db-schema"),
      // 单测环境不需要渲染 TikZ，避免 tikzjax 在 JSDOM 下执行导致崩溃
      "./tikzjax.js": path.resolve(__dirname, "./src/test-mocks/tikzjax.ts"),
    },
  },
});
