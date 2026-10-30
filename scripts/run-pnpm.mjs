import { execFileSync } from "node:child_process";
import { delimiter } from "node:path";

/** 在不同平台上按实际存在的环境变量键拼接 PATH，避免 Windows 上出现 Path/PATH 双键。 */
export function prependEnvPath(env, entries) {
  const pathKeys = Object.keys(env).filter(key => key.toLowerCase() === "path");
  const pathKey = pathKeys[0] ?? "PATH";
  const existingPath = env[pathKey] ?? "";
  for (const key of pathKeys) delete env[key];
  env[pathKey] = [...entries, existingPath].filter(Boolean).join(delimiter);
  return env;
}

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
