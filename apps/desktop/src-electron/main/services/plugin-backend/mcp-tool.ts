import path from "node:path";
import { WINDOWS_JOB_SCRIPT } from "./windows-job";
import { POSIX_TOOL_GUARDIAN } from "./posix-tool-guardian";
import type { BackendDescriptor } from "./manager";

export interface PluginStdioConfig {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/** 固定启动器不读取插件环境变量；仅将显式配置交给已授权的目标进程。 */
export function pluginMcpParameters(descriptor: BackendDescriptor, transport: PluginStdioConfig) {
  const backend = descriptor.manifest.backend;
  if (
    !backend?.systemAccess.includes("process") ||
    !backend.tools?.some(
      tool =>
        tool.command === transport.command &&
        (tool.args ?? []).every((arg, index) => transport.args?.[index] === arg)
    )
  )
    throw new Error("插件 stdio MCP 未在 backend.tools 声明");
  if (
    transport.args &&
    (!Array.isArray(transport.args) ||
      transport.args.length > 64 ||
      transport.args.some(
        arg => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0")
      ))
  )
    throw new Error("插件 stdio MCP 参数无效");
  if (
    transport.cwd !== undefined &&
    (typeof transport.cwd !== "string" || !path.isAbsolute(transport.cwd))
  )
    throw new Error("插件 stdio MCP 工作目录必须为绝对路径");
  if (
    transport.env &&
    (typeof transport.env !== "object" ||
      Array.isArray(transport.env) ||
      Object.entries(transport.env).some(
        ([key, value]) =>
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || typeof value !== "string" || value.includes("\0")
      ))
  )
    throw new Error("插件 stdio MCP 环境变量无效");
  const config = JSON.stringify({
    ...transport,
    cwd: transport.cwd ?? descriptor.cwd,
    args: transport.args ?? [],
    parentId: process.pid,
  });
  if (Buffer.byteLength(config) > 24000) throw new Error("插件 stdio MCP 配置过大");
  const env: Record<string, string> = {};
  for (const key of [
    "PATH",
    "HOME",
    "USERPROFILE",
    "SystemRoot",
    "WINDIR",
    "TEMP",
    "TMP",
    "TMPDIR",
    "LANG",
    "LC_ALL",
  ])
    if (process.env[key]) env[key] = process.env[key]!;
  env.TAU_PLUGIN_TOOL_CONFIG = config;
  const windows = process.platform === "win32";
  if (!windows) env.ELECTRON_RUN_AS_NODE = "1";
  return {
    command: windows
      ? path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe"
        )
      : process.execPath,
    args: windows
      ? [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(WINDOWS_JOB_SCRIPT, "utf16le").toString("base64"),
        ]
      : ["-e", POSIX_TOOL_GUARDIAN],
    env,
    cwd: descriptor.cwd,
    stderr: "pipe" as const,
  };
}
