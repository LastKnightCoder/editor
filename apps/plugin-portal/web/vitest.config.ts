import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 纯逻辑测试默认node；交互测试通过文件级注解启用jsdom。
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  resolve: { dedupe: ["react", "react-dom"] },
  test: { include: ["src/**/*.test.{ts,tsx}"], environment: "node" },
});
