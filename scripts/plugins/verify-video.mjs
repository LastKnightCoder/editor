import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
const directory = await mkdtemp(path.join(tmpdir(), "tau-video-"));
try {
  const zipPaths = process.argv.slice(2);
  if (zipPaths.length !== 2) throw new Error("请提供 Bilibili 与 YouTube 视频插件 ZIP");
  const artifacts = zipPaths.map(zipPath => {
    const zip = new (require("adm-zip"))(zipPath);
    const entry = zip.getEntries().find(entry => entry.entryName.endsWith("/manifest.json"));
    const manifest = JSON.parse(zip.readAsText(entry.entryName));
    return { manifest, code: zip.readAsText(manifest.id + "/" + manifest.main) };
  });
  await writeFile(path.join(directory, "artifacts.json"), JSON.stringify(artifacts));
  await writeFile(path.join(directory, "index.html"), "<!doctype html><meta charset=utf-8>");
  await writeFile(
    path.join(directory, "preload.cjs"),
    `const {contextBridge,ipcRenderer}=require("electron");contextBridge.exposeInMainWorld("electron",{platform:process.platform,invoke:(...args)=>ipcRenderer.invoke(...args),on:(channel,listener)=>ipcRenderer.on(channel,listener),off:(channel,listener)=>ipcRenderer.removeListener(channel,listener)});`
  );
  for (const [entry, output, platform] of [
    ["video-main.ts", "main.cjs", "node"],
    ["video-renderer.ts", "renderer.js", "browser"],
  ]) {
    await build({
      entryPoints: [path.join(root, "apps/desktop/scripts/plugin-runtime", entry)],
      outfile: path.join(directory, output),
      bundle: true,
      platform,
      format: platform === "node" ? "cjs" : "iife",
      external: ["electron"],
      define: { "import.meta.env": JSON.stringify({ DEV: false, PROD: true }) },
      tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
    });
  }
  await new Promise((resolve, reject) => {
    const child = spawn(require("electron"), [path.join(directory, "main.cjs"), directory], {
      stdio: "inherit",
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Electron视频验收超时"));
    }, 30000);
    child.once("error", reject);
    child.once("exit", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`Electron退出 ${code}`));
    });
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
