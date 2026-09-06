import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const mode = process.argv[2];
if (!["lint", "format", "format:check"].includes(mode)) {
  throw new Error("用法：node scripts/quality.mjs lint|format|format:check [文件...]");
}

const gitPaths = args =>
  execFileSync("git", args, { encoding: "utf8" }).split("\0").filter(Boolean);
const explicit = process.argv.slice(3);
const files = explicit.length
  ? explicit
  : [
      ...new Set([
        ...gitPaths(["diff", "--name-only", "-z", "HEAD"]),
        ...gitPaths(["ls-files", "--others", "--exclude-standard", "-z"]),
      ]),
    ].filter(path => existsSync(path) && !/(^|\/)(dist|data|node_modules|vendor)\//.test(path));
const lintFiles = files.filter(path => /\.(ts|tsx|mjs|cjs|js|jsx)$/.test(path));
const formatFiles = files.filter(
  path =>
    /\.(ts|tsx|mjs|cjs|js|jsx|json|md|css|less|scss|yml|yaml)$/.test(path) &&
    !path.endsWith("lock.yaml")
);
const supported = mode === "lint" ? lintFiles : formatFiles;

if (!supported.length) {
  console.log("没有需要检查的变更文件");
} else {
  const commands = [];
  if (mode === "lint") {
    commands.push(["exec", "eslint", "--ext", ".ts,.tsx,.mjs,.cjs,.js,.jsx", ...lintFiles]);
  } else if (mode === "format") {
    if (lintFiles.length)
      commands.push([
        "exec",
        "eslint",
        "--fix",
        "--ext",
        ".ts,.tsx,.mjs,.cjs,.js,.jsx",
        ...lintFiles,
      ]);
    if (formatFiles.length) commands.push(["exec", "prettier", "--write", ...formatFiles]);
  } else {
    commands.push(["exec", "prettier", "--check", ...formatFiles]);
  }
  for (const args of commands) {
    const result = spawnSync("pnpm", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      break;
    }
  }
}
