import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants, promises as fs } from "node:fs";
import path from "node:path";
import { buildMcpSpawnEnv, resolveMcpCommand } from "./mcpCommandResolver";

export interface SkillScriptRunOptions {
  /** Skill 根目录（绝对路径），脚本必须落在其内 */
  skillDir: string;
  /** 相对 Skill 根目录的脚本路径 */
  script: string;
  args?: string[];
  stdin?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface SkillScriptRunResult {
  command: string;
  args: string[];
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  cancelled: boolean;
  truncated: boolean;
  durationMs: number;
}

export const DEFAULT_SCRIPT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;

/** 解析脚本真实路径并校验落在 Skill 目录内（软链接指向目录外同样拒绝） */
export const resolveScriptPath = async (skillDir: string, script: string): Promise<string> => {
  const relative = script.replace(/\\/g, "/").replace(/^\.?\//, "");
  if (!relative || path.isAbsolute(relative))
    throw new Error("脚本路径必须是相对 Skill 目录的路径");
  const root = await fs.realpath(skillDir);
  const target = await fs.realpath(path.resolve(root, relative)).catch(() => {
    throw new Error(`脚本不存在：${relative}`);
  });
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("脚本必须位于该 Skill 目录内");
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error(`不是文件：${relative}`);
  return target;
};

/** 按扩展名选解释器；GUI 进程 PATH 不全，解释器经登录 shell 兜底解析（同 MCP stdio） */
export const resolveInterpreter = (
  scriptPath: string,
  env: Record<string, string>
): { command: string; prefixArgs: string[]; env: Record<string, string> } => {
  const ext = path.extname(scriptPath).toLowerCase();
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return {
      command: process.execPath,
      prefixArgs: [scriptPath],
      env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
    };
  }
  if (ext === ".py") {
    const name = process.platform === "win32" ? "python" : "python3";
    return { command: resolveMcpCommand(name, env), prefixArgs: [scriptPath], env };
  }
  if (ext === ".sh" || ext === ".bash") {
    return { command: resolveMcpCommand("bash", env), prefixArgs: [scriptPath], env };
  }
  if (ext === ".ts") {
    return { command: resolveMcpCommand("npx", env), prefixArgs: ["-y", "tsx", scriptPath], env };
  }
  try {
    accessSync(scriptPath, constants.X_OK);
  } catch {
    throw new Error(`不支持的脚本类型「${ext || "无扩展名"}」，且文件没有可执行权限`);
  }
  return { command: scriptPath, prefixArgs: [], env };
};

const running = new Map<string, ChildProcess>();

export const cancelSkillScript = (runId: string): boolean => {
  const child = running.get(runId);
  if (!child) return false;
  child.kill("SIGTERM");
  return true;
};

export const runSkillScript = async (
  options: SkillScriptRunOptions,
  runId?: string
): Promise<SkillScriptRunResult> => {
  const scriptPath = await resolveScriptPath(options.skillDir, options.script);
  const baseEnv = buildMcpSpawnEnv();
  const interpreter = resolveInterpreter(scriptPath, baseEnv);
  const args = [...interpreter.prefixArgs, ...(options.args ?? []).map(String)];
  const timeoutMs = options.timeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;
  const maxBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(interpreter.command, args, {
      cwd: options.skillDir,
      env: interpreter.env as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    if (runId) running.set(runId, child);

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let cancelled = false;
    const append = (current: string, chunk: Buffer) => {
      if (current.length >= maxBytes) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString("utf8");
      if (next.length > maxBytes) {
        truncated = true;
        return next.slice(0, maxBytes);
      }
      return next;
    };
    child.stdout?.on("data", (chunk: Buffer) => (stdout = append(stdout, chunk)));
    child.stderr?.on("data", (chunk: Buffer) => (stderr = append(stderr, chunk)));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.exitCode === null && child.kill("SIGKILL"), 3000);
    }, timeoutMs);

    child.on("error", error => {
      clearTimeout(timer);
      if (runId) running.delete(runId);
      reject(new Error(`启动脚本失败：${error.message}`));
    });
    child.on("close", (exitCode, signal) => {
      clearTimeout(timer);
      if (runId) running.delete(runId);
      if (!timedOut && signal) cancelled = true;
      resolve({
        command: interpreter.command,
        args,
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut,
        cancelled,
        truncated,
        durationMs: Date.now() - startedAt,
      });
    });

    if (options.stdin) child.stdin?.write(options.stdin);
    child.stdin?.end();
  });
};
