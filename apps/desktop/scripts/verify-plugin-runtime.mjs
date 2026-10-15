import { build } from "esbuild";
import { mkdtemp, rm, writeFile, cp, mkdir, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.length < 8) throw new Error("需要两个插件及重载、失败、挂起和清理故障构建目录");
const directory = await mkdtemp(path.join(tmpdir(), "tau-plugin-runtime-"));
const report = { status: "running", phases: [] };
try {
  const fixtures = [];
  for (let index = 0; index < 6; index++) {
    const target = path.join(directory, "fixtures", String(index));
    await cp(path.resolve(process.argv[index + 2]), target, { recursive: true });
    fixtures.push(target);
  }
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
    TAU_PLUGIN_TEST_ARTIFACT: fixtures[0],
    TAU_PLUGIN_TEST_SECOND: fixtures[1],
    TAU_PLUGIN_TEST_REPLACEMENT: fixtures[2],
    TAU_PLUGIN_TEST_FAILING: fixtures[3],
    TAU_PLUGIN_TEST_HANGING: fixtures[4],
    TAU_PLUGIN_TEST_CLEANUP: fixtures[5],
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = createRequire(path.join(root, "package.json"))("electron");
  const originalManifest = await readFile(path.join(fixtures[0], "manifest.json"), "utf8");
  for (const phase of [
    "initial",
    "restore",
    "disabled",
    "skip",
    "remove",
    "removed",
    "missing",
    "recover-missing",
    "incompatible",
    "recover-incompatible",
    "failed-install",
    "failed-restart",
    "timeout",
    "cleanup",
    "recover-cleanup",
  ]) {
    if (phase === "missing")
      await rename(path.join(fixtures[0], "main.js"), path.join(fixtures[0], "main.js.missing"));
    if (phase === "recover-missing")
      await rename(path.join(fixtures[0], "main.js.missing"), path.join(fixtures[0], "main.js"));
    if (phase === "incompatible")
      await writeFile(
        path.join(fixtures[0], "manifest.json"),
        JSON.stringify({ ...JSON.parse(originalManifest), apiVersion: 2 })
      );
    if (phase === "recover-incompatible")
      await writeFile(path.join(fixtures[0], "manifest.json"), originalManifest);
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
    const phaseReport = JSON.parse(
      await readFile(path.join(directory, "reports", `${phase}.json`), "utf8")
    );
    report.phases.push(phaseReport);
    if (code !== 0) throw new Error(`Electron 插件验证失败：${code}`);
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
