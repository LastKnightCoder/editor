import { rmSync } from "node:fs";
import { defineConfig, splitVendorChunkPlugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import electron from "vite-plugin-electron/simple";
import pkg from "./package.json";
import fs from "fs-extra";

import * as path from "path";
import { platform } from "node:os";

// https://vitejs.dev/config/
export default defineConfig(() => {
  rmSync("dist-electron", { recursive: true, force: true });

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
              sourcemap: false,
              minify: true,
              outDir: "dist-electron/main",
              rollupOptions: {
                external: Object.keys(
                  "dependencies" in pkg ? pkg.dependencies : {},
                ),
                plugins: [
                  {
                    name: "copy-typst-worker",
                    closeBundle() {
                      fs.ensureDirSync("dist-electron/main/workers");
                      fs.copySync(
                        "src-electron/main/workers/typst-worker.js",
                        "dist-electron/main/workers/typst-worker.js",
                      );
                    },
                  },
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
                  {
                    name: "ffmpeg",
                    closeBundle() {
                      if (platform() === "win32") {
                        fs.copySync(
                          "node_modules/ffmpeg-static/ffmpeg.exe",
                          "dist-electron/main/ffmpeg.exe",
                        );
                      } else if (platform() === "darwin") {
                        fs.copySync(
                          "node_modules/ffmpeg-static/ffmpeg",
                          "dist-electron/main/ffmpeg",
                        );
                      }
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
              sourcemap: false,
              minify: true,
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
      watch: {
        followSymlinks: false,
      },
    },
    envPrefix: ["VITE_"],
    build: {
      minify: "esbuild",
      sourcemap: false,
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
      target: "esnext",
    },
  };
});
