import { execFileSync } from "node:child_process";

/** 运行 pnpm 子命令。
 * pnpm run 会把自身入口给到 npm_execpath，用当前 node 直接执行；
 * 该方式不依赖 PATH 查找 pnpm（Windows 上 pnpm 常为自管理安装或 .cmd 批处理，
 * 派生子进程的 PATH 中未必能解析到）。无 npm_execpath 时回退 shell 方式。 */
export function runPnpm(args, options = {}) {
  if (process.env.npm_execpath) {
    return execFileSync(process.execPath, [process.env.npm_execpath, ...args], options);
  }
  return execFileSync("pnpm", args, { ...options, shell: process.platform === "win32" });
}
