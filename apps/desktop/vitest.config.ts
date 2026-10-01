import { configDefaults, defineConfig } from "vitest/config";
import { createRequire } from "node:module";
import path from "path";

// vitest 跑在 Node 上，而 desktop 的 better-sqlite3 已被 electron-rebuild 编为
// Electron ABI；collaboration-server 的同名依赖由根 postinstall 保持 Node ABI，
// 主进程侧测试（src-electron）统一解析到它
const nodeSqlite = createRequire(
  path.resolve(__dirname, "../collaboration-server/package.json")
).resolve("better-sqlite3");
const emojiPicker = createRequire(
  path.resolve(__dirname, "../../editor-extensions/list/package.json")
).resolve("@emoji-mart/react");

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentMatchGlobs: [["src-electron/main/modules/__tests__/pi-*.test.ts", "node"]],
    setupFiles: ["./src/test-setup.ts"],
    // e2e spec 由 Playwright 独立执行（test:collaboration:e2e），vitest 不收集
    exclude: [...configDefaults.exclude, "e2e/**"],
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
    dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd", "react-dnd-html5-backend"],
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@tau/rpc": path.resolve(__dirname, "../../packages/rpc"),
      "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
      "@tau/editor": path.resolve(__dirname, "../../packages/editor"),
      "@tau/editor-collab": path.resolve(__dirname, "../../packages/editor-collab"),
      "@tau/db-schema": path.resolve(__dirname, "../../packages/db-schema"),
      "better-sqlite3": nodeSqlite,
      "@emoji-mart/react": emojiPicker,
      // 单测环境不需要渲染 TikZ，避免 tikzjax 在 JSDOM 下执行导致崩溃
      "./tikzjax.js": path.resolve(__dirname, "./src/test-mocks/tikzjax.ts"),
    },
  },
});
