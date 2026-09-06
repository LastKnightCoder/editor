import { defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    alias: {
      "better-sqlite3": require.resolve("better-sqlite3"),
      // 测试通过相对路径引入 desktop 源码，需同步 desktop 侧的路径别名
      "@": path.resolve(__dirname, "../desktop/src"),
      "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
      // database.ts 顶层实例化依赖 electron 运行时，且与表模块循环依赖，替换为桩
      [path.resolve(__dirname, "../desktop/src-electron/main/modules/database.ts")]: path.resolve(
        __dirname,
        "src/testing/database-stub.ts"
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 20000,
  },
});
