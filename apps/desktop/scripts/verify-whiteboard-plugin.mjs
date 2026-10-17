import { build } from "esbuild";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(desktop, "../..");
const require = createRequire(path.join(desktop, "package.json"));
const zip = process.argv[2];
const pluginId = process.argv[3] ?? "example.whiteboard-probe";
if (!["example.whiteboard-probe", "taunote.stickman"].includes(pluginId))
  throw new Error("未知验收插件");
if (!zip)
  throw new Error("用法：node apps/desktop/scripts/verify-whiteboard-plugin.mjs <独立作者 ZIP>");
const output = path.join(root, "output/whiteboard-plugin", randomUUID());
await mkdir(output, { recursive: true });
const { build: viteBuild } = await import(require.resolve("vite"));
const { default: react } = await import(require.resolve("@vitejs/plugin-react-swc"));
const { default: tailwind } = await import(require.resolve("@tailwindcss/vite"));
await viteBuild({
  configFile: false,
  root: desktop,
  base: "./",
  plugins: [react(), tailwind()],
  define: { "process.env.NODE_ENV": '"production"' },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react-dnd",
      "react-dnd-html5-backend",
      "dnd-core",
      "slate",
      "slate-react",
    ],
    alias: {
      "@": path.join(desktop, "src"),
      "@tau/editor": path.join(root, "packages/editor"),
      "@tau/shared": path.join(root, "packages/shared"),
      "@tau/editor-collab": path.join(root, "packages/editor-collab"),
      "@tau/db-schema": path.join(root, "packages/db-schema"),
      "@tau/rpc": path.join(root, "packages/rpc"),
      "@tau/platform": path.join(root, "packages/platform"),
    },
  },
  build: {
    outDir: output,
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: {
        renderer: path.join(desktop, "scripts/whiteboard-plugin/renderer.tsx"),
        acceptance: path.join(
          root,
          "packages/whiteboard/src/__tests__/fixtures/stickman-acceptance.tsx"
        ),
      },
      formats: ["es"],
      fileName: (_format, name) => `${name}.js`,
    },
  },
});
await build({
  entryPoints: [path.join(desktop, "src-electron/preload/index.ts")],
  outfile: path.join(output, "preload.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
});
await build({
  entryPoints: [path.join(desktop, "scripts/whiteboard-plugin/verify.ts")],
  outfile: path.join(output, "verify.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
});
const styles = (await readdir(output))
  .filter(file => file.endsWith(".css"))
  .map(file => `<link rel="stylesheet" href="./${file}">`)
  .join("");
await writeFile(
  path.join(output, "index.html"),
  "<!doctype html><html><head>" +
    styles +
    '<style>body{margin:0}#root{width:1000px;height:640px} [data-whiteboard-root]{position:relative}</style></head><body><div id="root"></div><script type="module" src="./acceptance.js"></script><script type="module" src="./renderer.js"></script></body></html>'
);
const phases = ["initial", "restart", "disabled", "missing", "restored"];
for (const phase of phases) {
  const env = {
    ...process.env,
    TAU_WHITEBOARD_VERIFY_ROOT: output,
    TAU_WHITEBOARD_VERIFY_ZIP: path.resolve(zip),
    TAU_WHITEBOARD_VERIFY_PHASE: phase,
    TAU_WHITEBOARD_VERIFY_ID: pluginId,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(require("electron"), [path.join(output, "verify.cjs")], {
      env,
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`白板验收超时：${phase}`));
    }, 60000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`白板验收失败：${phase} (${code})`));
    });
  });
}
await writeFile(
  path.join(output, "report.json"),
  JSON.stringify({ passed: true, zip: path.resolve(zip), phases }, null, 2)
);
console.log(`白板插件验收通过：${output}`);
