/**
 * 样板间（组件检查器）的独立 dev 配置 —— 纯浏览器 MPA，不加载 Electron。
 *
 * 与主 dev（vite.config.mts，端口 6174）互不干扰：无 electron 插件、独立端口
 * 6199、入口 showcase.html。`pnpm showcase` 启动并自动打开浏览器。
 * 样式走同一套 tailwind + tokens.css（语义类/tau 词表），组件直接 import
 * packages/ui 的真实组件——mockup 版（docs/redesign/mockups/showcase/）
 * 只是视觉定稿稿，本入口才是长期维护的样板间（D-005）。
 */
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import * as path from "path";
import { createThemeBootstrapScript } from "../../packages/ui/src/theme/bootstrap";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // 与主 dev 配置同源的 workspace 包别名：档案组件 import 真实渲染器，
      // 依赖链会拉到 db-schema / shared 等包的深路径子模块（如 model-version），
      // pnpm 符号链接 + 无 exports 声明的包必须走源码别名才能解析
      "@tau/agent": path.resolve(__dirname, "../../packages/agent"),
      "@tau/editor": path.resolve(__dirname, "../../packages/editor"),
      "@tau/db-schema": path.resolve(__dirname, "../../packages/db-schema"),
      "@tau/rpc": path.resolve(__dirname, "../../packages/rpc"),
      "@tau/platform": path.resolve(__dirname, "../../packages/platform"),
      "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
      "@tau/themes": path.resolve(__dirname, "../../packages/themes"),
    },
  },
  plugins: [{ name: "tau-theme-bootstrap", transformIndexHtml: () => [{ tag: "script", children: createThemeBootstrapScript(), injectTo: "head-prepend" }] }, react(), tailwindcss()],
  build: { outDir: "output/showcase-build", rollupOptions: { input: path.resolve(__dirname, "showcase.html") } },
  clearScreen: false,
  server: {
    port: 6199,
    strictPort: true,
    open: "/showcase.html",
  },
  envPrefix: ["VITE_"],
  optimizeDeps: {
    entries: ["showcase.html", "src/showcase/**/*.{ts,tsx}"],
  },
});
