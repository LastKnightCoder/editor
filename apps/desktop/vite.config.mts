import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import fs from "fs-extra";
import { createThemeBootstrapScript } from "@tau/themes";

import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runtimeDependencyExternals = [
  "7zip-min",
  "node-llama-cpp",
  "@firecrawl/anydoc",
  "turndown",
  "@node-rs/jieba",
  "@node-rs/jieba/dict",
  "@silvia-odwyer/photon-node",
  "@tailwindcss/oxide",
  "@vscode/ripgrep",
  "better-sqlite3",
  "electron-updater",
  "font-list",
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
        "slate",
        "slate-react",
        "react-dnd",
        "react-dnd-html5-backend",
        "dnd-core",
      ],
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@quick-card": path.resolve(__dirname, "quick-card"),
        "@editor": path.resolve(__dirname, "src/components/Editor"),
        "@tau/editor-collab": path.resolve(__dirname, "../../packages/editor-collab"),
        "@tau/db-schema": path.resolve(__dirname, "../../packages/db-schema"),
        "@tau/rpc": path.resolve(__dirname, "../../packages/rpc"),
        "@tau/platform": path.resolve(__dirname, "../../packages/platform"),
        "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
      },
    },
    plugins: [
      {
        name: "tau-theme-bootstrap",
        transformIndexHtml: () => [
          { tag: "script", children: createThemeBootstrapScript(), injectTo: "head-prepend" },
        ],
      },
      react(),
      tailwindcss(),
      electron({
        main: {
          entry: {
            index: "src-electron/main/index.ts",
            // 发布站点生成跑在 worker_threads 里（modules/publish-generator-client）
            "publish-generator-worker": "src-electron/main/workers/publish-generator.worker.ts",
            // 知识地图离线计算（向量近邻 + 主题划分 + 布局）跑在 worker_threads 里（modules/knowledge-map-builder）
            "knowledge-map-worker": "src-electron/main/workers/knowledge-map.worker.ts",
            "local-inference-worker": "src-electron/main/workers/local-inference.worker.ts",
            "plugin-backend-worker": "src-electron/main/workers/plugin-backend.worker.ts",
          },
          onstart(args) {
            if (process.env.VSCODE_DEBUG) {
              console.log(/* For `.vscode/.debug.script.mjs` */ "[startup] Electron App");
            } else {
              args.startup();
            }
          },
          vite: {
            resolve: {
              // 主进程共用桌面入口的 pi-ai，避免不同 peer 实例重复进入同一 bundle。
              dedupe: ["@earendil-works/pi-ai"],
              alias: {
                "@": path.resolve(__dirname, "src"),
                "@tau/contracts": path.resolve(__dirname, "../../packages/contracts"),
                "@tau/rpc": path.resolve(__dirname, "../../packages/rpc"),
                "@tau/shared": path.resolve(__dirname, "../../packages/shared"),
                "@tau/db-schema": path.resolve(__dirname, "../../packages/db-schema"),
              },
            },
            build: {
              sourcemap: false,
              minify: true,
              outDir: "dist-electron/main",
              rolldownOptions: {
                external: [
                  ...runtimeDependencyExternals,
                  // Exclude large renderer-only packages to prevent memory overflow
                  "mathjax-full",
                  "highlight.js",
                  "juice",
                  "mermaid",
                  "katex",
                  "cheerio",
                ],
                plugins: [
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
                "@tau/db-schema": path.resolve(__dirname, "../../packages/db-schema"),
              },
            },
            build: {
              sourcemap: false,
              minify: true,
              outDir: "dist-electron/preload",
              rolldownOptions: {
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
      minify: "oxc" as const,
      sourcemap: false,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 2000,
      rolldownOptions: {
        // framer-motion（motion/react 的实际实现）为兼容 RSC 在每个模块顶部带
        // "use client"，纯客户端 Electron 环境无语义，逐模块告警纯属噪音
        checks: { moduleLevelDirective: false },
        input: {
          index: path.resolve(__dirname, "index.html"),
          "content-runtime": path.resolve(__dirname, "content-runtime.html"),
        },
        output: {
          codeSplitting: {
            groups: [
              { name: "react", test: /[/\\]node_modules[/\\]react[/\\]/, priority: 50 },
              { name: "react-dom", test: /[/\\]node_modules[/\\]react-dom[/\\]/, priority: 40 },
              {
                name: "react-router-dom",
                test: /[/\\]node_modules[/\\]react-router-dom[/\\]/,
                priority: 30,
              },
              { name: "mermaid", test: /[/\\]node_modules[/\\]mermaid[/\\]/, priority: 20 },
              { name: "katex", test: /[/\\]node_modules[/\\]katex[/\\]/, priority: 10 },
            ],
          },
        },
      },
      target: "esnext",
    },
  };
});
