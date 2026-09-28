import { defineConfig } from "vitest/config";

// 默认 node 环境：根入口必须不依赖 DOM；需要 DOM 的测试在文件头用 @vitest-environment jsdom 声明
export default defineConfig({ test: { environment: "node", restoreMocks: true } });
