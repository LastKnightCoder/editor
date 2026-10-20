import { build } from "esbuild";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const directory = await mkdtemp(path.join(tmpdir(), "tau-backend-runtime-"));
try {
  for (const [input, output] of [
    ["scripts/plugin-backend/main.ts", "main.cjs"],
    ["src-electron/main/workers/plugin-backend.worker.ts", "worker.cjs"],
  ])
    await build({
      entryPoints: [path.join(root, input)],
      outfile: path.join(directory, output),
      bundle: true,
      platform: "node",
      format: "cjs",
      external: ["electron"],
      tsconfig: path.join(root, "tsconfig.json"),
    });
  const env = { ...process.env, TAU_BACKEND_TEST_DIRECTORY: directory };
  delete env.ELECTRON_RUN_AS_NODE;
  const executable = createRequire(path.join(root, "package.json"))("electron");
  await new Promise((resolve, reject) => {
    const child = spawn(executable, [path.join(directory, "main.cjs")], { env, stdio: "inherit" });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("后台进程验证超时"));
    }, 30_000);
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`后台验证退出码 ${code}`));
    });
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
