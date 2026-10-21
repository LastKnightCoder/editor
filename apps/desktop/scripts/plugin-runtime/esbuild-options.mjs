import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** 与 vite.config.mts 的主进程 external 一致：原生或体积大的运行时依赖不进包。 */
const RUNTIME_EXTERNALS = [
  "7zip-min",
  "node-llama-cpp",
  "@firecrawl/anydoc",
  "turndown",
  "@node-rs/jieba",
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
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Vite 专有写法的等价处理：?raw 按原文打包，import.meta.glob 等不可用的模块整体替换。 */
function viteCompat(stubs) {
  return {
    name: "vite-compat",
    setup(build) {
      build.onResolve({ filter: /\?raw$/ }, async args => {
        const resolved = await build.resolve(args.path.replace(/\?raw$/, ""), {
          kind: args.kind,
          resolveDir: args.resolveDir,
        });
        return resolved.errors.length
          ? { errors: resolved.errors }
          : { path: resolved.path, namespace: "raw" };
      });
      build.onLoad({ filter: /.*/, namespace: "raw" }, args => ({
        contents: readFileSync(args.path, "utf8"),
        loader: "text",
      }));
      for (const [suffix, contents] of Object.entries(stubs)) {
        const filter = new RegExp(`[\\\\/]${escape(suffix).replace(/\//g, "[\\\\/]")}$`);
        build.onLoad({ filter }, () => ({ contents, loader: "js" }));
      }
    },
  };
}

/** 渲染端：静态资源不参与断言，按空内容或 data URL 处理；dev 打开仅开发环境可见的入口。 */
export function rendererBuildOptions(desktop, { entry, outfile, stubs = {}, dev = false }) {
  return {
    entryPoints: [path.join(desktop, entry)],
    outfile,
    bundle: true,
    platform: "browser",
    format: "iife",
    tsconfig: path.join(desktop, "tsconfig.json"),
    define: { "import.meta.env": JSON.stringify({ DEV: dev, PROD: !dev }) },
    loader: {
      ".png": "dataurl",
      ".svg": "dataurl",
      ".ttf": "empty",
      ".woff": "empty",
      ".woff2": "empty",
    },
    logLevel: "error",
    plugins: [
      viteCompat({
        "utils/bundled-font-embed.ts":
          "export const rangeStart = () => 0; export async function getBundledLocalFonts() { return []; }",
        ...stubs,
      }),
    ],
  };
}

/** 主进程（输出 .mjs）：应用目录指向临时目录；产物不在工作区内，外部依赖改写为绝对路径以便运行时 require。 */
export function mainBuildOptions(desktop, { entry, outfile, stubs = {} }) {
  const require = createRequire(path.join(desktop, "package.json"));
  const externals = new RegExp(`^(${RUNTIME_EXTERNALS.map(escape).join("|")})(/.*)?$`);
  return {
    entryPoints: [path.join(desktop, entry)],
    outfile,
    bundle: true,
    platform: "node",
    // 正式构建的主进程是 ESM，部分依赖读取 import.meta.url；内联的 CommonJS 依赖经 banner 取得 require。
    format: "esm",
    banner: {
      js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
    },
    tsconfig: path.join(desktop, "tsconfig.json"),
    loader: { ".png": "dataurl" },
    logLevel: "error",
    plugins: [
      {
        name: "runtime-externals",
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({ path: "electron", external: true }));
          build.onResolve({ filter: externals }, args => ({
            path: require.resolve(args.path),
            external: true,
          }));
        },
      },
      viteCompat({
        "utils/PathUtil.ts":
          "export default { getAppDir: () => process.env.TAU_LOCAL_TEST_APP_DIR };",
        ...stubs,
      }),
    ],
  };
}
