import { defineConfig } from "vitest/config";
import base from "./vitest.config";

/** 发布协议与安装事务测试不打开 SQLite，无需准备原生数据库 ABI。 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    globalSetup: [],
    include: [
      "src-electron/main/modules/__tests__/publish-*.test.ts",
      "src-electron/main/services/__tests__/plugin-updates.test.ts",
      "src-electron/main/services/__tests__/plugin-publish.test.ts",
      "src-electron/main/services/__tests__/{plugin-publish-provider,provider-settings,git-publication}.test.ts",
      "src/app/plugins/__tests__/publish-registry.test.ts",
      "src/features/publish/__tests__/*.test.ts*",
      "src/features/plugins/__tests__/{local-manager,plugin-model}.test.ts",
    ],
  },
});
