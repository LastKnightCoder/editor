import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "apps/desktop/package.json"));
const { build } = require("esbuild");
const inputs = process.argv.slice(2).map(file => path.resolve(file));
if (inputs.length !== 2) throw new Error("请提供 GitHub 与 S3 发布插件 ZIP");
const directory = path.join(root, "output/publish-provider-integration", randomUUID());
await mkdir(directory, { recursive: true });
const runtime = await mkdtemp(path.join(directory, "runtime-"));
try {
  await writeFile(path.join(runtime, "inputs.json"), JSON.stringify(inputs));
  await writeFile(path.join(runtime, "index.html"), "<!doctype html><meta charset=utf-8>");
  await writeFile(
    path.join(runtime, "preload.cjs"),
    `const {contextBridge,ipcRenderer}=require("electron");contextBridge.exposeInMainWorld("electron",{platform:process.platform,invoke:(...args)=>ipcRenderer.invoke(...args),on:(channel,listener)=>ipcRenderer.on(channel,listener),off:(channel,listener)=>ipcRenderer.removeListener(channel,listener)});`
  );
  for (const [entry, output, platform] of [
    ["publish-main.ts", "main.cjs", "node"],
    ["publish-renderer.ts", "renderer.js", "browser"],
  ]) {
    await build({
      entryPoints: [path.join(root, "apps/desktop/scripts/plugin-runtime", entry)],
      outfile: path.join(runtime, output),
      bundle: true,
      platform,
      format: platform === "node" ? "cjs" : "iife",
      external: ["electron"],
      define: { "import.meta.env": JSON.stringify({ DEV: false, PROD: true }) },
      tsconfig: path.join(root, "apps/desktop/tsconfig.json"),
    });
  }
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.env.TAU_ELECTRON_BIN || require("electron"),
      [path.join(runtime, "main.cjs"), runtime],
      { stdio: "inherit" }
    );
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("发布插件行为验收超时"));
    }, 60000);
    child.once("error", reject);
    child.once("exit", code => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error("Electron 退出 " + code));
    });
  });
  console.log("发布插件验收报告：" + path.join(directory, "report.json"));
} finally {
  await rm(runtime, { recursive: true, force: true });
}
