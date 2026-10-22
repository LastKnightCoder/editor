import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
const directory = await mkdtemp(path.join(tmpdir(), "tau-local-discovery-"));
const report = { status: "running", platform: process.platform, arch: process.arch, phases: [] };
const updates = process.argv.includes("--updates");
try {
  await mkdir(path.join(directory, "profile"));
  await writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><meta charset="utf-8"><div id="root"></div>'
  );
  const desktop = path.join(root, "apps/desktop");
  const { mainBuildOptions, rendererBuildOptions } = await import(
    path.join(desktop, "scripts/plugin-runtime/esbuild-options.mjs")
  );
  await Promise.all([
    build(
      mainBuildOptions(desktop, {
        entry: "scripts/plugin-runtime/local-main.ts",
        outfile: path.join(directory, "main.mjs"),
      })
    ),
    build(
      rendererBuildOptions(desktop, {
        entry: "scripts/plugin-runtime/local-renderer.tsx",
        outfile: path.join(directory, "renderer.js"),
        // ZIP 安装入口只在开发环境显示。
        dev: true,
      })
    ),
    build({
      entryPoints: [path.join(desktop, "src-electron/preload/index.ts")],
      outfile: path.join(directory, "preload.cjs"),
      bundle: true,
      platform: "node",
      external: ["electron"],
      logLevel: "error",
    }),
  ]);
  for (const phase of updates
    ? ["update-start", "update-restart", "update-failed", "update-recovered"]
    : ["initial", "refresh", "reinstall", "disabled"]) {
    const env = {
      ...process.env,
      TAU_LOCAL_TEST_APP_DIR: path.join(directory, "app-data"),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    await new Promise((resolve, reject) => {
      const child = spawn(
        require("electron"),
        [path.join(directory, "main.mjs"), phase, directory],
        { cwd: directory, env, stdio: "inherit" }
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 45000);
      child.once("error", error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error(`${phase} 退出 ${code}`));
      });
    });
    report.phases.push(JSON.parse(await readFile(path.join(directory, phase + ".json"), "utf8")));
    console.log(`[local-discovery] ${phase} 通过`);
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  await mkdir(path.join(root, "output"), { recursive: true });
  await writeFile(
    path.join(
      root,
      updates ? "output/local-update-report.json" : "output/local-discovery-report.json"
    ),
    JSON.stringify(report, null, 2)
  );
  await rm(directory, { recursive: true, force: true });
}
