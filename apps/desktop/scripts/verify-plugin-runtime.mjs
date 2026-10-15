import { build } from "esbuild";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.length < 6) throw new Error("需要两个插件及成功/失败重载构建的目录");
const directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-runtime-"));
try {
  await Promise.all([
    build({
      entryPoints: [path.join(root, "src-electron/main/modules/plugin-development.ts")],
      outfile: path.join(directory, "service.cjs"),
      bundle: true,
      platform: "node",
      external: ["electron"],
    }),
    build({
      entryPoints: [path.join(root, "src-electron/preload/index.ts")],
      outfile: path.join(directory, "preload.cjs"),
      bundle: true,
      platform: "node",
      external: ["electron"],
    }),
    build({
      entryPoints: [path.join(root, "scripts/plugin-runtime/renderer.tsx")],
      outfile: path.join(directory, "renderer.js"),
      bundle: true,
      platform: "browser",
      format: "iife",
      tsconfig: path.join(root, "tsconfig.json"),
      define: { "import.meta.env.DEV": "true", "import.meta.env.PROD": "false" },
    }),
  ]);
  await writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><html><body><div id="root"></div></body></html>'
  );
  const env = {
    ...process.env,
    TAU_PLUGIN_TEST_DIRECTORY: directory,
    TAU_PLUGIN_TEST_ARTIFACT: path.resolve(process.argv[2]),
    TAU_PLUGIN_TEST_SECOND: path.resolve(process.argv[3]),
    TAU_PLUGIN_TEST_REPLACEMENT: path.resolve(process.argv[4]),
    TAU_PLUGIN_TEST_FAILING: path.resolve(process.argv[5]),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = createRequire(path.join(root, "package.json"))("electron");
  for (const phase of ["initial", "restore", "disabled", "skip"]) {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(executable, [path.join(root, "scripts/plugin-runtime/main.cjs")], {
        env: { ...env, TAU_PLUGIN_TEST_PHASE: phase },
        stdio: "inherit",
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Electron 插件验证超时"));
      }, 60000);
      child.once("error", error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", code => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    if (code !== 0) throw new Error(`Electron 插件验证失败：${code}`);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
