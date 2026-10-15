import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdir, open, readFile, writeFile, rename } from "node:fs/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "output/plugin-g1");
await mkdir(output, { recursive: true });
const report = {
  status: "running",
  startedAt: new Date().toISOString(),
  baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  worktreeDirty:
    execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim().length >
    0,
  platform: process.platform,
  arch: process.arch,
  scope: "可信桌面开发 G1 行为验收，不包含视觉、G2 第三方开放或 G3 生产领域能力",
  steps: [],
};
const externalReport = path.join(output, "external-report.json");
const steps = [
  ["sdk-types", "pnpm", ["--filter", "@tau/plugins", "check"]],
  ["sdk-tests", "pnpm", ["--filter", "@tau/plugins", "test"]],
  ["sdk-build", "pnpm", ["--filter", "@tau/plugins", "build"]],
  [
    "desktop-tests",
    "pnpm",
    [
      "--filter",
      "desktop",
      "exec",
      "vitest",
      "run",
      "src/features/plugins/__tests__",
      "src/features/settings/__tests__/plugin-settings.test.tsx",
      "src-electron/main/services/__tests__",
      "src-electron/main/module-init/__tests__/module-layering.test.ts",
    ],
  ],
  ["external-workflow", process.execPath, ["scripts/plugins/verify-external.mjs", externalReport]],
  ["desktop-build", "pnpm", ["--filter", "desktop", "build"]],
  [
    "editor-boundaries",
    process.execPath,
    ["scripts/editor-refactor-baseline.mjs", "--check", "--quiet"],
  ],
  ["antd-boundaries", process.execPath, ["scripts/antd-ratchet.mjs", "--check"]],
  ["database-boundaries", process.execPath, ["scripts/check-database-boundaries.mjs"]],
  ["whiteboard-boundaries", process.execPath, ["scripts/check-whiteboard-boundaries.mjs"]],
  ["diff", "git", ["diff", "--check"]],
];
try {
  for (const [name, command, args] of steps) {
    const started = Date.now();
    const log = path.join(output, `${name}.log`);
    const result = { name, command: [command, ...args], log, status: "running" };
    report.steps.push(result);
    console.log(`[G1] 开始 ${name}`);
    const handle = await open(log, "w");
    try {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(command, args, {
          cwd: root,
          stdio: ["ignore", handle.fd, handle.fd],
          env: { ...process.env, pnpm_config_verify_deps_before_run: "warn" },
        });
        child.once("error", reject);
        child.once("exit", resolve);
      });
      result.exitCode = code;
      if (code !== 0) throw new Error(`${name} 验证失败，请查看 ${log}`);
      result.status = "passed";
    } catch (error) {
      result.status = "failed";
      throw error;
    } finally {
      result.durationMs = Date.now() - started;
      await handle.close();
    }
    if (name === "external-workflow")
      report.external = JSON.parse(await readFile(externalReport, "utf8"));
    console.log(`[G1] 通过 ${name}`);
  }
  report.status = "passed";
} catch (error) {
  report.status = "failed";
  report.error = String(error);
  process.exitCode = 1;
  console.error(error);
} finally {
  report.finishedAt = new Date().toISOString();
  const filename = path.join(output, "report.json");
  await writeFile(filename + ".tmp", JSON.stringify(report, null, 2));
  await rename(filename + ".tmp", filename);
  console.log(`[G1] ${report.status}，报告：${filename}`);
}
