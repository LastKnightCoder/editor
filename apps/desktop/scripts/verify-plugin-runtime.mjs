import { build } from "esbuild";
import { mkdtemp, rm, writeFile, cp, mkdir, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mainBuildOptions, rendererBuildOptions } from "./plugin-runtime/esbuild-options.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.length < 8) throw new Error("需要两个插件及升级、失败、挂起和清理故障构建目录");
const directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-runtime-"));
const report = { status: "running", phases: [] };
const names = ["ARTIFACT", "SECOND", "REPLACEMENT", "FAILING", "HANGING", "CLEANUP"];
const appDirectory = path.join(directory, "app-data");
const counter = path.join(appDirectory, "plugins/example.external-counter");
try {
  const fixtures = {};
  for (const [index, name] of names.entries()) {
    fixtures[name] = path.join(directory, "fixtures", name.toLowerCase());
    await cp(path.resolve(process.argv[index + 2]), fixtures[name], { recursive: true });
  }
  await Promise.all([
    build(
      mainBuildOptions(root, {
        entry: "scripts/plugin-runtime/main.ts",
        outfile: path.join(directory, "main.mjs"),
      })
    ),
    build({
      entryPoints: [path.join(root, "src-electron/preload/index.ts")],
      outfile: path.join(directory, "preload.cjs"),
      bundle: true,
      platform: "node",
      external: ["electron"],
      logLevel: "error",
    }),
    build(
      rendererBuildOptions(root, {
        entry: "scripts/plugin-runtime/renderer.tsx",
        outfile: path.join(directory, "renderer.js"),
      })
    ),
  ]);
  await writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>'
  );
  const env = {
    ...process.env,
    TAU_PLUGIN_TEST_DIRECTORY: directory,
    TAU_LOCAL_TEST_APP_DIR: appDirectory,
    ...Object.fromEntries(names.map(name => [`TAU_PLUGIN_TEST_${name}`, fixtures[name]])),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const executable = createRequire(path.join(root, "package.json"))("electron");
  const install = async source => {
    await rm(counter, { recursive: true, force: true });
    await cp(source, counter, { recursive: true });
  };
  const originalManifest = await readFile(path.join(fixtures.REPLACEMENT, "manifest.json"), "utf8");
  // 每个阶段先按作者或用户的实际操作整理插件目录，再启动独立进程。
  const prepare = {
    initial: () => install(fixtures.ARTIFACT),
    missing: () => rename(path.join(counter, "main.js"), path.join(counter, "main.js.missing")),
    "recover-missing": () =>
      rename(path.join(counter, "main.js.missing"), path.join(counter, "main.js")),
    incompatible: () =>
      writeFile(
        path.join(counter, "manifest.json"),
        JSON.stringify({ ...JSON.parse(originalManifest), apiVersion: 2 })
      ),
    "recover-incompatible": () => writeFile(path.join(counter, "manifest.json"), originalManifest),
    "failed-install": () => install(fixtures.FAILING),
    "recover-failed": () => install(fixtures.REPLACEMENT),
    timeout: () => install(fixtures.HANGING),
    "recover-timeout": () => install(fixtures.REPLACEMENT),
    cleanup: () => install(fixtures.CLEANUP),
    "recover-cleanup": () => install(fixtures.REPLACEMENT),
  };
  for (const phase of [
    "initial",
    "restore",
    "disabled",
    "missing",
    "recover-missing",
    "incompatible",
    "recover-incompatible",
    "failed-install",
    "recover-failed",
    "timeout",
    "recover-timeout",
    "cleanup",
    "recover-cleanup",
  ]) {
    await prepare[phase]?.();
    const code = await new Promise((resolve, reject) => {
      const child = spawn(executable, [path.join(directory, "main.mjs")], {
        cwd: directory,
        env: { ...env, TAU_PLUGIN_TEST_PHASE: phase },
        stdio: "inherit",
      });
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Electron 插件验证超时：${phase}`));
      }, 90000);
      child.once("error", error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("exit", code => {
        clearTimeout(timer);
        resolve(code);
      });
    });
    const phaseReport = JSON.parse(
      await readFile(path.join(directory, "reports", `${phase}.json`), "utf8")
    );
    report.phases.push(phaseReport);
    if (code !== 0) throw new Error(`Electron 插件验证失败：${phase} 退出 ${code}`);
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  throw error;
} finally {
  if (process.argv[8]) {
    await mkdir(path.dirname(path.resolve(process.argv[8])), { recursive: true });
    await writeFile(process.argv[8], JSON.stringify(report, null, 2));
  }
  await rm(directory, { recursive: true, force: true });
}
