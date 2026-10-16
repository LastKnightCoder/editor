import { build } from "esbuild";
import { mkdtemp, cp, mkdir, readFile, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-services-"));
const require = createRequire(path.join(root, "package.json"));
await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"));
const assets = {
  name: "compiler-assets",
  setup(build) {
    build.onLoad({ filter: /\?(raw|url)$/ }, async args => {
      const file = args.path.replace(/\?(raw|url)$/, "");
      if (args.path.endsWith("?raw"))
        return { contents: await readFile(file, "utf8"), loader: "text" };
      const name = path.basename(file);
      await cp(file, path.join(directory, name));
      return { contents: `export default ${JSON.stringify("./" + name)}`, loader: "js" };
    });
    build.onResolve({ filter: /\?(raw|url)$/ }, args => {
      const suffix = args.path.match(/\?(raw|url)$/)[0];
      const base = args.path.slice(0, -suffix.length);
      return {
        path:
          (base.startsWith(".") ? path.resolve(args.resolveDir, base) : require.resolve(base)) +
          suffix,
      };
    });
  },
};
const common = {
  bundle: true,
  tsconfig: path.join(root, "tsconfig.json"),
  plugins: [assets],
  logLevel: "warning",
};
await build({
  ...common,
  entryPoints: [path.join(root, "scripts/plugin-services/main.ts")],
  outfile: path.join(directory, "main.cjs"),
  platform: "node",
  packages: "external",
});
await build({
  ...common,
  entryPoints: [path.join(root, "src-electron/main/workers/plugin-typst.worker.ts")],
  outfile: path.join(directory, "plugin-typst-worker.js"),
  platform: "node",
  packages: "external",
});
await build({
  ...common,
  entryPoints: [path.join(root, "src-electron/preload/index.ts")],
  outfile: path.join(directory, "preload.cjs"),
  platform: "node",
  external: ["electron"],
});
await mkdir(path.join(directory, "workers"));
await cp(
  path.join(root, "src-electron/main/workers/tailwind-runtime-worker.js"),
  path.join(directory, "workers/tailwind-runtime-worker.js")
);
await build({
  ...common,
  entryPoints: [path.join(root, "scripts/plugin-services/renderer.ts")],
  outfile: path.join(directory, "renderer.js"),
  platform: "browser",
  format: "iife",
  loader: {
    ".css": "empty",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
    ".svg": "dataurl",
    ".png": "dataurl",
  },
  define: {
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "process.env.NODE_ENV": '"production"',
  },
});
await writeFile(path.join(directory, "index.html"), "<!doctype html><html><body></body></html>");
const env = { ...process.env, TAU_SERVICE_TEST_DIRECTORY: directory };
delete env.ELECTRON_RUN_AS_NODE;
const code = await new Promise((resolve, reject) => {
  const child = spawn(require("electron"), [path.join(directory, "main.cjs")], {
    env,
    stdio: "inherit",
  });
  const timeout = setTimeout(() => {
    child.kill("SIGKILL");
    reject(new Error("服务验证超时"));
  }, 180_000);
  child.once("error", error => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", code => {
    clearTimeout(timeout);
    resolve(code);
  });
});
console.log("验证报告：", path.join(directory, "report.json"));
console.log(await readFile(path.join(directory, "report.json"), "utf8"));
if (code !== 0) process.exitCode = 1;
