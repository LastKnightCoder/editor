import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { createThemeBootstrapScript } from "@tau/themes";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, root, "VITE_");
  // 模拟数据只服务本地开发，构建产物必须直连真实后端
  if (command === "build" && env.VITE_MOCK_API === "true") {
    throw new Error("构建禁止启用 VITE_MOCK_API=true：模拟模式只用于 dev:web");
  }
  return {
    root,
    envDir: root,
    plugins: [
      {
        name: "tau-theme-bootstrap",
        transformIndexHtml: () => [
          { tag: "script", children: createThemeBootstrapScript(), injectTo: "head-prepend" },
        ],
      },
      react(),
      tailwindcss(),
    ],
    resolve: { dedupe: ["react", "react-dom"] },
    server: { port: 5173, strictPort: true },
    preview: { port: 5173, strictPort: true },
    build: {
      target: ["chrome107", "edge107", "firefox104", "safari16"],
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
