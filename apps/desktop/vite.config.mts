import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import electron from "vite-plugin-electron/simple";
import fs from "fs-extra";
import { createThemeBootstrapScript } from "@tau/themes";

import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionRequire = (name: string) =>
  createRequire(path.resolve(__dirname, `../../editor-extensions/${name}/package.json`));

const runtimeDependencyExternals = [
  "7zip-min",
  "node-llama-cpp",
  "@firecrawl/anydoc",
  "turndown",
  "@myriaddreamin/typst-ts-node-compiler",
  "@ffprobe-installer/ffprobe",
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
        "@tau/editor": path.resolve(__dirname, "../../packages/editor"),
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
            "plugin-typst-worker": "src-electron/main/workers/plugin-typst.worker.ts",
            // 发布站点生成跑在 worker_threads 里（modules/publish-generator-client）
            "publish-generator-worker": "src-electron/main/workers/publish-generator.worker.ts",
            // 知识地图离线计算（向量近邻 + 主题划分 + 布局）跑在 worker_threads 里（modules/knowledge-map-builder）
            "knowledge-map-worker": "src-electron/main/workers/knowledge-map.worker.ts",
            "index-content-worker": "src-electron/main/workers/index-content.worker.ts",
            "local-inference-worker": "src-electron/main/workers/local-inference.worker.ts",
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
            mermaid: [extensionRequire("diagram").resolve("mermaid")],
            katex: ["katex"],
            "@babel/standalone": [extensionRequire("custom-block").resolve("@babel/standalone")],
          },
        },
      },
      target: "esnext",
    },
  };
});
