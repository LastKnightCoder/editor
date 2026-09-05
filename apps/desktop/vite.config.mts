import { rmSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import fs from "fs-extra";

import * as path from "path";

const runtimeDependencyExternals = [
  "7zip-min",
  "@myriaddreamin/typst-ts-node-compiler",
  "@node-rs/jieba",
  "@tailwindcss/oxide",
  "@vscode/ripgrep",
  "better-sqlite3",
  "font-list",
  "node-pty",
  "sharp",
  "sqlite-vec",
  "tailwindcss",
  "ws",
];

export default defineConfig(() => {
  rmSync("dist-electron", { recursive: true, force: true });

  return {
    resolve: {
      dedupe: [
        "react",
        "react-dom",
        "react-dnd",
        "react-dnd-html5-backend",
        "dnd-core",
      ],
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@quick-card": path.resolve(__dirname, "quick-card"),
        "@editor": path.resolve(__dirname, "src/components/Editor"),
        "@tau/agent": path.resolve(__dirname, "../../packages/agent"),
        "@tau/editor": path.resolve(__dirname, "../../packages/editor"),
        "@tau/db-schema": path.resolve(__dirname, "../../packages/db-schema"),
        "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
        "@tau/themes": path.resolve(__dirname, "../../packages/themes"),
        "foliate-js": path.resolve(__dirname, "../../packages/foliate-js"),
        "@pdfjs/pdf.mjs": path.resolve(
          __dirname,
          "../../packages/foliate-js/vendor/pdfjs/pdf.mjs"
        ),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      electron({
        main: {
          entry: "src-electron/main/index.ts",
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log(
                /* For `.vscode/.debug.script.mjs` */ "[startup] Electron App"
              );
            } else {
              args.startup();
            }
          },
          vite: {
            resolve: {
              alias: {
                "@": path.resolve(__dirname, "src"),
                "@tau/agent": path.resolve(__dirname, "../../packages/agent"),
                "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
                "@tau/db-schema": path.resolve(
                  __dirname,
                  "../../packages/db-schema"
                ),
              },
            },
            build: {
              sourcemap: false,
              minify: true,
              outDir: "dist-electron/main",
              rollupOptions: {
                external: [
                  ...runtimeDependencyExternals,
                  // Exclude large renderer-only packages to prevent memory overflow
                  "mathjax-full",
                  "highlight.js",
                  "abcjs",
                  "juice",
                  "mermaid",
                  "katex",
                  "@babel/standalone",
                  "cheerio",
                  "echarts",
                ],
                plugins: [
                  {
                    name: "copy-typst-worker",
                    closeBundle() {
                      fs.ensureDirSync("dist-electron/main/workers");
                      fs.copySync(
                        "src-electron/main/workers/typst-worker.js",
                        "dist-electron/main/workers/typst-worker.js"
                      );
                    },
                  },
                  {
                    name: "copy-tailwind-runtime-worker",
                    closeBundle() {
                      fs.ensureDirSync("dist-electron/main/workers");
                      fs.copySync(
                        "src-electron/main/workers/tailwind-runtime-worker.js",
                        "dist-electron/main/workers/tailwind-runtime-worker.js"
                      );
                    },
                  },
                  {
                    name: "copy-pdfjs-worker",
                    closeBundle() {
                      fs.copySync(
                        "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
                        "dist-electron/main/pdf.worker.mjs"
                      );
                    },
                  },
                  {
                    name: "jieba-dict-copy",
                    closeBundle() {
                      // 构建完成后触发
                      fs.copySync(
                        "node_modules/@node-rs/jieba/dict.txt",
                        "dist-electron/main/dict.txt" // 确保输出到这里
                      );
                      fs.copySync(
                        "node_modules/@node-rs/jieba/idf.txt",
                        "dist-electron/main/idf.txt" // 确保输出到这里
                      );
                    },
                  },
                  // ffmpeg 改为运行时按需下载，不再随应用打包
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
                "@tau/db-schema": path.resolve(
                  __dirname,
                  "../../packages/db-schema"
                ),
              },
            },
            build: {
              sourcemap: false,
              minify: true,
              outDir: "dist-electron/preload",
              rollupOptions: {
                external: runtimeDependencyExternals,
              },
            },
          },
        },
      }),
    ],
    clearScreen: false,
    server: {
      port: 6174,
      strictPort: true,
      watch: {
        followSymlinks: false,
        ignored: ["**/blog/**"],
      },
    },
    envPrefix: ["VITE_"],
    optimizeDeps: {
      exclude: ["blog"],
      entries: ["index.html", "src/**/*.{ts,tsx}"],
    },
    build: {
      minify: "esbuild" as const,
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 2000,
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
