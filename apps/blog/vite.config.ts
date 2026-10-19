import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { fileURLToPath } from "node:url";

const configDirectory = fileURLToPath(new URL(".", import.meta.url));

// 主项目路径
const mainProjectPath = resolve(configDirectory, "../desktop");

export default defineConfig({
  base: "./", // 相对路径，支持任意部署位置
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd", "react-dnd-html5-backend"],
    alias: {
      // blog 自己的模块
      "@blog": resolve(configDirectory, "src"),
      // 主项目的模块（与主项目的 @ 保持一致）
      "@": resolve(mainProjectPath, "src"),
      // monorepo packages
      "@tau/editor": resolve(configDirectory, "../../packages/editor"),
      "@tau/shared": resolve(configDirectory, "../../packages/shared"),
    },
  },
  optimizeDeps: {
    include: ["slate", "slate-react", "slate-history", "ahooks", "classnames"],
  },
  build: {
    rollupOptions: {
      input: {
        home: resolve(configDirectory, "src/templates/home/index.html"),
        card: resolve(configDirectory, "src/templates/card/index.html"),
        article: resolve(configDirectory, "src/templates/article/index.html"),
        doc: resolve(configDirectory, "src/templates/doc/index.html"),
        quest: resolve(configDirectory, "src/templates/quest/index.html"),
        list: resolve(configDirectory, "src/templates/list/index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
