import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
const directory = await mkdtemp(path.join(tmpdir(), "tau-local-discovery-"));
const report = { status: "running", platform: process.platform, arch: process.arch, phases: [] };
const waterUpgrade = process.argv.includes("--water-upgrade");
const water = process.argv.includes("--water") || waterUpgrade;
const updates = process.argv.includes("--updates");
const installed = process.argv.includes("--installed") || water;
try {
  if (waterUpgrade) {
    const { homedir } = await import("node:os");
    const appRoot = path.join(homedir(), ".editor");
    const source = process.argv[process.argv.indexOf("--water-upgrade") + 1];
    if (!source || source.startsWith("--")) throw Error("需要提供喝水打卡 1.3.0 ZIP 路径");
    const zip = new (require("adm-zip"))(await readFile(path.resolve(source)));
    const manifest = JSON.parse(zip.readAsText("lastknight.water-checkin/manifest.json"));
    if (manifest.id !== "lastknight.water-checkin" || manifest.version !== "1.3.0")
      throw Error("目标 ZIP 不是喝水打卡 1.3.0");
    const current = JSON.parse(
      await readFile(path.join(appRoot, "plugins/lastknight.water-checkin/manifest.json"), "utf8")
    );
    if (current.version !== "1.2.0") throw Error("实际安装不是 1.2.0，停止以免覆盖已有操作");
    await cp(
      path.join(appRoot, "plugins/lastknight.water-checkin"),
      path.join(directory, "original"),
      { recursive: true }
    );
    await cp(path.resolve(source), path.join(directory, "water-update.zip"));
  }
  await mkdir(path.join(directory, "profile"));
  await writeFile(
    path.join(directory, "index.html"),
    '<!doctype html><meta charset="utf-8"><div id="root"></div>'
  );
  for (const [entry, output, platform, format] of [
    ["scripts/plugin-runtime/local-main.ts", "main.cjs", "node", "cjs"],
    [
      water
        ? "scripts/plugin-runtime/water-renderer.tsx"
        : "scripts/plugin-runtime/local-renderer.tsx",
      "renderer.js",
      "browser",
      "iife",
    ],
    ["src-electron/preload/index.ts", "preload.cjs", "node", "cjs"],
  ])
    await build({
      entryPoints: [path.join(root, "apps/desktop", entry)],
      outfile: path.join(directory, output),
      bundle: true,
      platform,
      format,
      external: ["electron"],
      loader: { ".png": "dataurl" },
      tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
      define: { "import.meta.env": JSON.stringify({ DEV: false, PROD: true }) },
      plugins: [
        {
          name: "temporary-app-directory",
          setup(build) {
            if (water) {
              build.onLoad({ filter: /[\\/]app[\\/]navSlots\.tsx$/ }, () => ({
                contents:
                  "export const NAV_BADGE_SLOTS = {}; export const NAV_CHILDREN_SLOTS = {}; export const useNavChildrenContent = () => ({});",
                loader: "js",
              }));
              build.onLoad({ filter: /[\\/]app[\\/]WindowControls\.tsx$/ }, () => ({
                contents: "export const MacTrafficLights = () => null;",
                loader: "js",
              }));
              build.onLoad({ filter: /[\\/]app[\\/]useFullScreen\.ts$/ }, () => ({
                contents: "export const useFullScreen = () => false;",
                loader: "js",
              }));
            }
            build.onLoad({ filter: /[\\/]utils[\\/]PathUtil\.ts$/ }, () => ({
              contents: "export default { getAppDir: () => process.env.TAU_LOCAL_TEST_APP_DIR };",
              loader: "js",
            }));
          },
        },
      ],
    });
  for (const phase of waterUpgrade
    ? ["water-upgrade-start", "water-upgrade-applied", "water-upgrade-restored"]
    : updates
      ? ["update-start", "update-applied", "update-restored", "update-failed", "update-recovered"]
      : water
        ? ["water", "water-restore", "water-disabled"]
        : installed
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
    if (waterUpgrade) {
      for (const kind of ["pending", "transactions"]) {
        const names = await readdir(
          path.join(env.TAU_LOCAL_TEST_APP_DIR, "plugin-updates", kind)
        ).catch(error => {
          if (error.code === "ENOENT") return [];
          throw error;
        });
        const unexpected = names.filter(
          name =>
            !name.startsWith(".") &&
            (kind === "transactions" ||
              phase === "water-upgrade-start" ||
              name !== "lastknight.water-checkin")
        );
        if (unexpected.length)
          throw Error(`发现其他待处理操作，停止：${kind}/${unexpected.join(",")}`);
      }
    }
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
  if (waterUpgrade) {
    const { homedir } = await import("node:os");
    for (const file of ["manifest.json", "main.js", "main.css"]) {
      const original = await readFile(path.join(directory, "original", file));
      const restored = await readFile(
        path.join(homedir(), ".editor/plugins/lastknight.water-checkin", file)
      );
      if (!original.equals(restored)) throw Error(`恢复后的 ${file} 与原始 1.2.0 不一致`);
    }
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
      waterUpgrade
        ? "output/water-upgrade-report.json"
        : updates
          ? "output/local-update-report.json"
          : water
            ? "output/water-author-report.json"
            : installed
              ? "output/installed-author-report.json"
              : "output/local-discovery-report.json"
    ),
    JSON.stringify(report, null, 2)
  );
  if (waterUpgrade && report.status !== "passed")
    console.error(`验收未完成，保留恢复资料：${directory}`);
  else await rm(directory, { recursive: true, force: true });
}
