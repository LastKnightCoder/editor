import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Windows 上 Node 不能直接 spawn pnpm 的 .cmd 包装器；改用当前 Node 执行 pnpm 的 JS 入口，
 * 不经过 shell，保留含空格与中文路径的参数原样传递。其他平台原样返回。
 */
export function resolveCommand(command, args) {
  if (process.platform !== "win32" || command !== "pnpm") return [command, args];
  const candidates = [
    process.env.npm_execpath?.endsWith("pnpm.cjs") ? process.env.npm_execpath : undefined,
    ...(process.env.PATH ?? "")
      .split(path.delimiter)
      .map(directory => path.join(directory, "node_modules", "pnpm", "bin", "pnpm.cjs")),
  ];
  const entry = candidates.find(candidate => candidate && existsSync(candidate));
  if (!entry) throw new Error("未找到 pnpm 的 JS 入口（node_modules/pnpm/bin/pnpm.cjs）");
  return [process.execPath, [entry, ...args]];
}
