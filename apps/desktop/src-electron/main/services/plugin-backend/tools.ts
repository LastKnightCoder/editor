import { spawn } from "node:child_process";
import path from "node:path";
import { WINDOWS_JOB_SCRIPT } from "./windows-job";
import { POSIX_TOOL_GUARDIAN } from "./posix-tool-guardian";
import type { BackendProcessResult } from "@tau/plugins/backend";
import type { BackendDescriptor } from "./manager";

/** 外部工具由宿主持有，插件进程死循环或崩溃仍能回收工具进程组。 */
export function runBackendTool(
  descriptor: BackendDescriptor,
  toolId: string,
  args: string[],
  signal: AbortSignal
): Promise<BackendProcessResult> {
  const tool = descriptor.manifest.backend?.tools?.find(tool => tool.id === toolId);
  if (!tool || !descriptor.manifest.backend?.systemAccess.includes("process"))
    return Promise.reject(new Error("插件未声明此外部工具"));
  if (
    !Array.isArray(args) ||
    args.length > 64 ||
    args.some(arg => typeof arg !== "string" || arg.length > 4096 || arg.includes("\0"))
  )
    return Promise.reject(new Error("外部工具参数无效"));
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const env = {} as NodeJS.ProcessEnv;
    for (const key of [
      "PATH",
      "HOME",
      "TMPDIR",
      "LANG",
      "LC_ALL",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "USERPROFILE",
    ])
      if (process.env[key]) env[key] = process.env[key]!;
    const windows = process.platform === "win32";
    const command = windows
      ? path.join(
          process.env.SystemRoot || "C:\\Windows",
          "System32/WindowsPowerShell/v1.0/powershell.exe"
        )
      : process.execPath;
    if (!windows) env.ELECTRON_RUN_AS_NODE = "1";
    const parameters = windows
      ? [
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(WINDOWS_JOB_SCRIPT, "utf16le").toString("base64"),
        ]
      : ["-e", POSIX_TOOL_GUARDIAN];
    const child = spawn(command, parameters, {
      cwd: descriptor.cwd,
      env,
      shell: false,
      detached: false,
      windowsHide: true,
      stdio: windows ? ["pipe", "pipe", "pipe"] : ["pipe", "pipe", "pipe", "ipc"],
    });
    child.stdin!.on("error", () => undefined);
    child.stdin!.end(
      JSON.stringify({
        command: tool.command,
        args: [...(tool.args ?? []), ...args],
        cwd: descriptor.cwd,
        parentId: process.pid,
      })
    );
    let toolPid: number | undefined;
    child.on("message", message => {
      const pid = (message as { pid?: unknown })?.pid;
      if (typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0) toolPid = pid;
    });
    let total = 0;
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    let failure: Error | undefined;
    const terminate = () => {
      if (!child.pid) return;
      if (windows) {
        child.kill("SIGKILL");
        return;
      }
      if (toolPid)
        try {
          process.kill(-toolPid, "SIGKILL");
        } catch {
          /* 进程组可能已由监督进程回收。 */
        }
      child.kill("SIGTERM");
    };
    const cancel = () => {
      failure = new Error("外部工具已取消");
      terminate();
    };
    const timer = setTimeout(() => {
      failure = new Error("外部工具执行超时");
      terminate();
    }, 30_000);
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      total += chunk.length;
      if (total > 512 * 1024) {
        failure = new Error("外部工具输出超限");
        terminate();
      } else target.push(chunk);
    };
    child.stdout!.on("data", collect(stdout));
    child.stderr!.on("data", collect(stderr));
    signal.addEventListener("abort", cancel, { once: true });
    if (signal.aborted) cancel();
    child.once("error", error => {
      failure = error;
    });
    child.once("exit", terminate);
    child.once("close", code => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      terminate();
      if (failure) reject(failure);
      else
        resolve({
          exitCode: code ?? -1,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
        });
    });
  });
}
