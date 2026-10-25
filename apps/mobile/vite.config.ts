import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { mobilePluginSpike } from "./scripts/plugin-spike";
import { createThemeBootstrapScript } from "@tau/themes";
import { createLegacyThemeMigrationScript } from "./src/theme/legacyThemeMigration";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  build: { target: ["chrome107", "edge107", "firefox104", "safari16"] },
  define: {
    __TAU_PLUGIN_VALIDATION_SUITE__: JSON.stringify(
      mode === "plugin-validation" ? (process.env.TAU_PLUGIN_VALIDATION_SUITE ?? "basic") : ""
    ),
    __TAU_PLUGIN_VALIDATION_SOURCES__:
      mode === "plugin-validation" && !process.env.TAU_PLUGIN_VALIDATION_SOURCE_URL
        ? readFileSync(
            process.env.TAU_PLUGIN_VALIDATION_SOURCES ??
              path.resolve(__dirname, "../../output/plugin-portability-validation/sources.json"),
            "utf8"
          )
        : "[]",
    __TAU_PLUGIN_VALIDATION_SOURCE_URL__: JSON.stringify(
      mode === "plugin-validation" ? (process.env.TAU_PLUGIN_VALIDATION_SOURCE_URL ?? "") : ""
    ),
  },
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
    ...(mode === "plugin-spike" ? [mobilePluginSpike()] : []),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd", "react-dnd-html5-backend"],
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@validation": path.resolve(__dirname, "validation"),
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
    hmr:
      mode === "plugin-spike"
        ? false
        : host
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
