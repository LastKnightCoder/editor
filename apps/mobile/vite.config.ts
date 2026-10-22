import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createThemeBootstrapScript } from "@tau/themes";
import { createLegacyThemeMigrationScript } from "./src/theme/legacyThemeMigration";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    {
      // 首帧前应用主题（与桌面端同一首帧脚本），先把旧版移动端主题偏好迁成新格式
      name: "tau-theme-bootstrap",
      transformIndexHtml: () => [
        {
          tag: "script",
          children: createLegacyThemeMigrationScript() + createThemeBootstrapScript(),
          injectTo: "head-prepend",
        },
      ],
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd", "react-dnd-html5-backend"],
    alias: {
      react: path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
      "react/jsx-runtime": path.resolve(__dirname, "node_modules/react/jsx-runtime.js"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    // Windows 上 Hyper-V 动态保留端口段覆盖了 1346-1547（含 1420），改用 2420 避开
    port: 2420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 2421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
