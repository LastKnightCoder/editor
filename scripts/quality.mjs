import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const mode = process.argv[2];
if (!["lint", "lint:all", "format", "format:check"].includes(mode)) {
  throw new Error("用法：node scripts/quality.mjs lint|lint:all|format|format:check [文件...]");
}

const gitPaths = args =>
  execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
const explicit = process.argv.slice(3);
for (const path of explicit) {
  if (!existsSync(path)) throw new Error(`文件不存在：${path}`);
}
const files = (
  mode === "lint:all"
    ? gitPaths(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).filter(path =>
        /^(apps|packages|examples)\/.*\.(ts|tsx)$/.test(path)
      )
    : explicit.length
      ? explicit
      : [
          ...new Set([
            ...gitPaths(["diff", "--name-only", "-z", "HEAD"]),
            ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"]),
          ]),
        ]
).filter(
  path =>
    existsSync(path) &&
    (explicit.length ||
      mode === "lint:all" ||
      !/(^|\/)(dist|data|node_modules|vendor)\//.test(path))
);
const lintFiles = files.filter(path => /\.(ts|tsx|mjs|cjs|js|jsx)$/.test(path));
const formatFiles = files.filter(
  path =>
    /\.(ts|tsx|mjs|cjs|js|jsx|json|md|css|less|scss|yml|yaml)$/.test(path) &&
    !path.endsWith("lock.yaml")
);
const supported = mode.startsWith("lint") ? lintFiles : formatFiles;

function run(tool, options, paths) {
  const require = createRequire(import.meta.url);
  const manifest = require.resolve(`${tool}/package.json`);
  const binary = resolve(dirname(manifest), require(manifest).bin[tool]);
  const batches = [[]];
  const byteLimit = process.platform === "win32" ? 24000 : 100000;
  let bytes = 0;
  for (const path of paths) {
    const size = Buffer.byteLength(path) + 1;
    // 为 Windows 命令行长度和多字节路径保留余量。
    if (bytes + size > byteLimit) {
      batches.push([]);
      bytes = 0;
    }
    batches.at(-1).push(path);
    bytes += size;
  }
  let status = 0;
  for (const batch of batches) {
    const result = spawnSync(
      process.execPath,
      [binary, ...options, "--no-error-on-unmatched-pattern", "--", ...batch],
      { stdio: "inherit" }
    );
    if (result.error) throw result.error;
    status = Math.max(status, result.status ?? 1);
  }
  return status;
}

if (!supported.length) {
  console.log("没有需要检查的变更文件");
} else {
  const commands = [];
  if (mode.startsWith("lint")) {
    commands.push(["oxlint", [], lintFiles]);
  } else if (mode === "format") {
    if (lintFiles.length) commands.push(["oxlint", ["--fix"], lintFiles]);
    if (formatFiles.length) commands.push(["oxfmt", ["--write"], formatFiles]);
  } else {
    commands.push(["oxfmt", ["--check"], formatFiles]);
  }
  for (const [tool, options, paths] of commands) {
    const status = run(tool, options, paths);
    if (status !== 0) {
      process.exitCode = status;
      break;
    }
  }
}
