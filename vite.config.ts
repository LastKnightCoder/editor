import { rmSync } from "node:fs";
import { defineConfig, splitVendorChunkPlugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import visualizer from "rollup-plugin-visualizer";
import electron from "vite-plugin-electron/simple";
import pkg from "./package.json";
import fs from "fs-extra";

import * as path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  rmSync("dist-electron", { recursive: true, force: true });

  const isServe = command === "serve";
  const isBuild = command === "build";
  const sourcemap = isServe || !!process.env.VSCODE_DEBUG;

  return {
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@quick-card": path.resolve(__dirname, "quick-card"),
        "@editor": path.resolve(__dirname, "src/components/Editor"),
      },
    },
    plugins: [
      react(),
      splitVendorChunkPlugin(),
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      }),
      electron({
        main: {
          entry: "src-electron/main/index.ts",
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log(
                /* For `.vscode/.debug.script.mjs` */ "[startup] Electron App",
              );
            } else {
              args.startup();
            }
          },
          vite: {
            resolve: {
              alias: {
                "@": path.resolve(__dirname, "src"),
                "@quick-card": path.resolve(__dirname, "quick-card"),
                "@editor": path.resolve(__dirname, "src/components/Editor"),
              },
            },
            build: {
              sourcemap,
              minify: isBuild,
              outDir: "dist-electron/main",
              rollupOptions: {
                external: Object.keys(
                  "dependencies" in pkg ? pkg.dependencies : {},
                ),
                plugins: [
                  {
                    name: "jieba-dict-copy",
                    closeBundle() {
                      // 构建完成后触发
                      fs.copySync(
                        "node_modules/@node-rs/jieba/dict.txt",
                        "dist-electron/main/dict.txt", // 确保输出到这里
                      );
                      fs.copySync(
                        "node_modules/@node-rs/jieba/idf.txt",
                        "dist-electron/main/idf.txt", // 确保输出到这里
                      );
                    },
                  },
                ],
              },
            },
          },
        },
        preload: {
          input: "src-electron/preload/index.ts",
          vite: {
            resolve: {
              alias: {
                "@": path.resolve(__dirname, "src"),
                "@quick-card": path.resolve(__dirname, "quick-card"),
                "@editor": path.resolve(__dirname, "src/components/Editor"),
              },
            },
            build: {
              sourcemap: sourcemap ? "inline" : undefined,
              minify: isBuild,
              outDir: "dist-electron/preload",
              rollupOptions: {
                external: Object.keys(
                  "dependencies" in pkg ? pkg.dependencies : {},
                ),
              },
            },
          },
        },
      }),
    ],
    clearScreen: false,
    server: {
      strictPort: true,
    },
    envPrefix: ["VITE_", "TAURI_"],
    build: {
      // don't minify for debug builds
      minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
      // produce sourcemaps for debug builds
      sourcemap: !!process.env.TAURI_DEBUG,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react"],
            "react-dom": ["react-dom"],
            "react-router-dom": ["react-router-dom"],
            mermaid: ["mermaid"],
            katex: ["katex"],
            "@babel/standalone": ["@babel/standalone"],
          },
        },
      },
    },
  };
});
