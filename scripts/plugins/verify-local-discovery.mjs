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
const installed = process.argv.includes("--installed");
try {
  await mkdir(path.join(directory, "profile"));
  await writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><meta charset="utf-8"><div id="root"></div>'
  );
  for (const [entry, output, platform, format] of [
    ["scripts/plugin-runtime/local-main.ts", "main.cjs", "node", "cjs"],
    ["scripts/plugin-runtime/local-renderer.tsx", "renderer.js", "browser", "iife"],
    ["src-electron/preload/index.ts", "preload.cjs", "node", "cjs"],
  ])
    await build({
      entryPoints: [path.join(root, "apps/desktop", entry)],
      outfile: path.join(directory, output),
      bundle: true,
      platform,
      format,
      external: ["electron"],
      tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
      define: { "import.meta.env": JSON.stringify({ DEV: false, PROD: true }) },
      plugins: [
        {
          name: "temporary-app-directory",
          setup(build) {
            build.onLoad({ filter: /[\\/]utils[\\/]PathUtil\.ts$/ }, () => ({
              contents: "export default { getAppDir: () => process.env.TAU_LOCAL_TEST_APP_DIR };",
              loader: "js",
            }));
          },
        },
      ],
    });
  for (const phase of installed
    ? ["author", "author-restore"]
    : ["initial", "refresh", "reinstall", "disabled"]) {
    const env = {
      ...process.env,
      TAU_LOCAL_TEST_APP_DIR: installed
        ? path.join((await import("node:os")).homedir(), ".editor")
        : path.join(directory, "app-data"),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    delete env.NODE_PATH;
    await new Promise((resolve, reject) => {
      const child = spawn(
        require("electron"),
        [path.join(directory, "main.cjs"), phase, directory],
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
      installed ? "output/installed-author-report.json" : "output/local-discovery-report.json"
    ),
    JSON.stringify(report, null, 2)
  );
  await rm(directory, { recursive: true, force: true });
}
