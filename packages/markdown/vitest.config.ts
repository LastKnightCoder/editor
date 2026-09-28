import { defineConfig } from "vitest/config";

// node 环境：包内代码必须不依赖 DOM（01 §8.3）
export default defineConfig({ test: { environment: "node", restoreMocks: true } });
