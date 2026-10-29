import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/** 把含 pnpm.cmd 的目录前置到子进程 PATH。
 * package.json 钩子里的嵌套 pnpm 由 cmd 按 PATH 解析，当用户会话的 PATH 中
 * 没有 pnpm 可执行目录时钩子会失败。候选：pnpm 自管理安装目录（PNPM_HOME）
 * 与 npm 全局目录，均以 pnpm.CMD 实际存在为准；前置的普通目录会被 pnpm
 * 原样传给钩子进程。 */
export function withPnpmDirOnPath(env) {
  if (process.platform !== "win32") return env;
  const candidates = [
    process.env.PNPM_HOME,
    process.env.APPDATA && join(process.env.APPDATA, "npm"),
  ];
  const shimDirs = candidates.filter(dir => dir && existsSync(join(dir, "pnpm.CMD")));
  if (!shimDirs.length) return env;
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === "PATH") ?? "PATH";
  const parts = String(env[pathKey] ?? "")
    .split(delimiter)
    .filter(Boolean);
  const additions = shimDirs.filter(
    dir => !parts.some(part => part.toLowerCase() === dir.toLowerCase())
  );
  if (!additions.length) return env;
  return { ...env, [pathKey]: [...additions, ...parts].join(delimiter) };
}

/** 运行 pnpm 子命令。
 * pnpm run 会把自身入口给到 npm_execpath，用当前 node 直接执行，
 * 不依赖 PATH 查找 pnpm 本体；无 npm_execpath 时回退 shell 方式。 */
export function runPnpm(args, options = {}) {
  const env = withPnpmDirOnPath(options.env ?? process.env);
  if (process.env.npm_execpath) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], { ...options, env });
  }
  return execFileSync("pnpm", args, { ...options, env, shell: process.platform === "win32" });
}
