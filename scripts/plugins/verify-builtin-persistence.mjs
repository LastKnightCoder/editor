import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
const directory = await mkdtemp(path.join(tmpdir(), "tau-builtin-state-"));
const report = { status: "running", platform: process.platform, arch: process.arch, phases: [] };
try {
  await mkdir(path.join(directory, "profile"));
  await writeFile(
    path.join(directory, "index.html"),
    "<!doctype html><meta charset=utf-8><title>插件状态验证</title>"
  );
  for (const [entry, outfile, platform, format] of [
    ["builtin-persistence-main.ts", "main.cjs", "node", "cjs"],
    ["builtin-persistence-renderer.ts", "renderer.js", "browser", "iife"],
  ])
    await build({
      entryPoints: [path.join(root, "apps/desktop/scripts/plugin-runtime", entry)],
      outfile: path.join(directory, outfile),
      bundle: true,
      platform,
      format,
      external: ["electron"],
      define: { "import.meta.env": JSON.stringify({ DEV: false }) },
    });
  for (const phase of ["enable", "restore-and-disable", "remain-disabled"]) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    await new Promise((resolve, reject) => {
      const child = spawn(
        require("electron"),
        [path.join(directory, "main.cjs"), phase, directory],
        { cwd: directory, env, stdio: "inherit" }
      );
      const timer = setTimeout(() => child.kill("SIGKILL"), 30000);
      child.once("error", error => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", code => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`${phase} 退出 ${code}`));
      });
    });
    report.phases.push(JSON.parse(await readFile(path.join(directory, phase + ".json"), "utf8")));
    console.log(`[builtin-persistence] ${phase} 通过`);
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
    path.join(root, "output/builtin-persistence-report.json"),
    JSON.stringify(report, null, 2)
  );
  await rm(directory, { recursive: true, force: true });
}
