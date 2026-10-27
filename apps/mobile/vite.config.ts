import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { createThemeBootstrapScript } from "@tau/themes";

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
      // 首帧前应用两端共用的主题偏好。
      name: "tau-theme-bootstrap",
      transformIndexHtml: () => [
        {
          tag: "script",
          children: createThemeBootstrapScript(),
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
