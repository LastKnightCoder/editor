import { build } from "esbuild";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import path from "node:path";
import AdmZip from "adm-zip";

const desktop = path.resolve(import.meta.dirname, "..");
const root = path.resolve(desktop, "../..");
const require = createRequire(path.join(desktop, "package.json"));
const archive = process.argv[2];
if (!archive) throw new Error("用法：node apps/desktop/scripts/verify-abc-plugin.mjs <插件 ZIP>");
const output = path.join(root, "output/abc-plugin", randomUUID());
await mkdir(path.join(output, "plugins"), { recursive: true });
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
      entry: path.join(desktop, "scripts/abc-plugin/renderer.tsx"),
      name: "TauAbcVerification",
      formats: ["iife"],
      fileName: () => "renderer.js",
    },
  },
});
await build({
  entryPoints: [path.join(desktop, "scripts/abc-plugin/main.ts")],
  outfile: path.join(output, "main.cjs"),
  bundle: true,
  platform: "node",
  external: ["electron"],
  loader: { ".css": "empty" },
  logLevel: "warning",
});
const server = createServer(async (request, response) => {
  if (request.url === "/") {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><html><body><div id="root"></div></body></html>');
  } else if (request.url === "/plugin/main.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(await readFile(path.join(output, "plugins/tau.abc/main.js")));
  } else if (request.url === "/plugin/main.css") {
    response.setHeader("Content-Type", "text/css");
    response.end(await readFile(path.join(output, "plugins/tau.abc/main.css")));
  } else {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const phases = ["initial", "restart", "disabled", "restored"];
try {
  for (const phase of phases) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    await new Promise((resolve, reject) => {
      const child = spawn(
        require("electron"),
        [path.join(output, "main.cjs"), output, phase, url],
        { env, stdio: "inherit" }
      );
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`ABC 验收超时：${phase}`));
      }, 180_000);
      child.once("error", error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`ABC 验收失败：${phase} (${code})`));
      });
    });
  }
  await writeFile(
    path.join(output, "report.json"),
    JSON.stringify(
      {
        passed: true,
        phases,
        archive: path.resolve(archive),
        sha256: createHash("sha256")
          .update(await readFile(archive))
          .digest("hex"),
      },
      null,
      2
    )
  );
  console.log(`ABC 插件验收通过：${output}`);
} finally {
  server.close();
}
