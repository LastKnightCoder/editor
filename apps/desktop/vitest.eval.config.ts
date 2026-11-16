import { configDefaults, defineConfig } from "vitest/config";
import base from "./vitest.config";

/**
 * LLM 评测脚本（src-electron/eval，依赖真实库副本与环境变量门控）不进默认单测收集，
 * 需显式指定本配置运行：`npx vitest run --config vitest.eval.config.ts src-electron/eval/<name>.eval.test.ts`。
 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["src-electron/eval/**/*.eval.test.ts"],
    // 覆盖 base 的 exclude（其中排除了 src-electron/eval/**），仅保留默认排除项
    exclude: configDefaults.exclude,
  },
});
