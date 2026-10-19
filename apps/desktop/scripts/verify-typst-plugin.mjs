import { build } from "esbuild";
import { mkdir, readFile, writeFile, cp, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";
import assert from "node:assert/strict";

const desktop = path.resolve(import.meta.dirname, "..");
const root = path.resolve(desktop, "../..");
const require = createRequire(path.join(desktop, "package.json"));
const archive = process.argv[2];
if (!archive) throw new Error("用法：node apps/desktop/scripts/verify-typst-plugin.mjs <插件 ZIP>");
const output = path.join(root, "output/typst-plugin", randomUUID());
await mkdir(path.join(output, "plugins"), { recursive: true });
await symlink(path.join(desktop, "node_modules"), path.join(output, "node_modules"));
await cp(archive, path.join(output, "plugin.zip"));
new AdmZip(path.resolve(archive)).extractAllTo(path.join(output, "plugins"));
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
    dedupe: ["react", "react-dom", "slate", "slate-react", "react-dnd", "react-dnd-html5-backend"],
    alias: {
      "@": path.join(desktop, "src"),
      "@blog": path.join(root, "apps/blog/src"),
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
      entry: path.join(desktop, "scripts/typst-plugin/renderer.tsx"),
      name: "TauTypstVerification",
      formats: ["iife"],
      fileName: () => "renderer.js",
    },
  },
});
const raw = {
  name: "compiler-raw",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, args => ({
      path: require.resolve(args.path.slice(0, -4)),
      namespace: "compiler-raw",
    }));
    build.onLoad({ filter: /.*/, namespace: "compiler-raw" }, async args => ({
      contents: await readFile(args.path, "utf8"),
      loader: "text",
    }));
  },
};
await build({
  entryPoints: [path.join(desktop, "scripts/typst-plugin/main.ts")],
  outfile: path.join(output, "main.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron", "@ffprobe-installer/ffprobe"],
  plugins: [raw],
  loader: { ".css": "empty" },
  logLevel: "warning",
});
await build({
  entryPoints: [path.join(desktop, "scripts/typst-plugin/preload.ts")],
  outfile: path.join(output, "preload.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
});
await build({
  entryPoints: [path.join(desktop, "src-electron/main/workers/plugin-typst.worker.ts")],
  outfile: path.join(output, "plugin-typst-worker.js"),
  bundle: true,
  platform: "node",
  packages: "external",
});
const server = createServer(async (request, response) => {
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end('<!doctype html><html><body><div id="root"></div></body></html>');
  } else if (request.url === "/plugin/main.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(await readFile(path.join(output, "plugins/tau.typst/main.js")));
  } else response.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
try {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(require("electron"), [path.join(output, "main.cjs"), output, url], {
      env,
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Typst 验证超时"));
    }, 180_000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error("Typst 验证失败"));
    });
  });
  const report = JSON.parse(await readFile(path.join(output, "report.json"), "utf8"));
  assert.equal(report.passed, true);
  assert.deepEqual(
    report.results.map(result => result.role),
    ["main", "editor-window", "markdown-window", "disabled"]
  );
  const bytes = await readFile(archive);
  await writeFile(
    path.join(output, "artifact.json"),
    JSON.stringify(
      {
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        archive: path.resolve(archive),
      },
      null,
      2
    )
  );
  console.log(`Typst 插件验收通过：${output}`);
} finally {
  server.close();
}
