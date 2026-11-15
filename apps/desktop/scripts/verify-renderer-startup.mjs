import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-renderer-startup-"));
try {
  const appRootIndex = process.argv.indexOf("--app-root");
  if (appRootIndex !== -1 && !process.argv[appRootIndex + 1])
    throw new Error("--app-root 缺少路径");
  const env = {
    ...process.env,
    TAU_STARTUP_APP_ROOT: appRootIndex === -1 ? root : path.resolve(process.argv[appRootIndex + 1]),
    TAU_STARTUP_PROFILE: directory,
    TAU_STARTUP_FAIL_DATABASE: process.argv.includes("--fail-database") ? "1" : "",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = createRequire(path.join(root, "package.json"))("electron");
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [path.join(import.meta.dirname, "startup/main.cjs")], {
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    const timer = setTimeout(() => child.kill(), 60_000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`生产启动检查失败：${code}`));
    });
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
