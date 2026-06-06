import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

// 主项目路径
const mainProjectPath = resolve(__dirname, "../desktop");

export default defineConfig({
  base: "./", // 相对路径，支持任意部署位置
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // blog 自己的模块
      "@blog": resolve(__dirname, "src"),
      // 主项目的模块（与主项目的 @ 保持一致）
      "@": resolve(mainProjectPath, "src"),
      "@editor": resolve(mainProjectPath, "src/components/Editor"),
      // monorepo packages
      "@tau/editor": resolve(__dirname, "../../packages/editor/src"),
      "@tau/shared": resolve(__dirname, "../../packages/shared/src"),
      "@tau/themes": resolve(__dirname, "../../packages/themes/src"),
    },
  },
  // 确保可以解析主项目的依赖和样式
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  optimizeDeps: {
    include: ["slate", "slate-react", "slate-history", "ahooks", "classnames"],
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(__dirname, "src/templates/home/index.html"),
        card: resolve(__dirname, "src/templates/card/index.html"),
        article: resolve(__dirname, "src/templates/article/index.html"),
        doc: resolve(__dirname, "src/templates/doc/index.html"),
        quest: resolve(__dirname, "src/templates/quest/index.html"),
        list: resolve(__dirname, "src/templates/list/index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
