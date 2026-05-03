import { execFileSync } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import path from "node:path";

type SpawnEnv = Record<string, string | undefined>;

const SHELL_CANDIDATES = [process.env.SHELL, "/bin/zsh", "/bin/bash"].filter(
  (value): value is string => typeof value === "string" && value.length > 0,
);

const PATH_KEY =
  process.platform === "win32"
    ? Object.keys(process.env).find((key) => key.toLowerCase() === "path") ||
      "Path"
    : "PATH";

const WINDOWS_PATH_EXTENSIONS = [".exe", ".cmd", ".bat", ".com"];

const hasPathSeparator = (command: string): boolean => {
  return command.includes("/") || command.includes("\\");
};

const isExecutableFile = (filePath: string): boolean => {
  try {
    if (!existsSync(filePath)) {
      return false;
    }
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const getCommandCandidates = (command: string): string[] => {
  if (process.platform !== "win32") {
    return [command];
  }

  const extension = path.extname(command);
  if (extension) {
    return [command];
  }

  return [command, ...WINDOWS_PATH_EXTENSIONS.map((ext) => `${command}${ext}`)];
};

export const buildMcpSpawnEnv = (
  userEnv?: Record<string, string>,
): Record<string, string> => {
  const mergedEnv: SpawnEnv = {
    ...process.env,
    ...userEnv,
  };

  const inheritedPath = userEnv?.[PATH_KEY] ?? process.env[PATH_KEY];
  if (inheritedPath) {
    mergedEnv[PATH_KEY] = inheritedPath;
  }

  const sanitizedEnv: Record<string, string> = {};
  Object.entries(mergedEnv).forEach(([key, value]) => {
    if (typeof value === "string") {
      sanitizedEnv[key] = value;
    }
  });

  return sanitizedEnv;
};

export const findExecutableInPath = (
  command: string,
  rawPath?: string,
): string | null => {
  if (!rawPath) {
    return null;
  }

  for (const searchDir of rawPath.split(path.delimiter).filter(Boolean)) {
    for (const candidate of getCommandCandidates(command)) {
      const candidatePath = path.join(searchDir, candidate);
      if (isExecutableFile(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
};

const lookupWithLoginShell = (
  command: string,
  env: Record<string, string>,
): string | null => {
  for (const shellPath of SHELL_CANDIDATES) {
    if (!existsSync(shellPath)) {
      continue;
    }

    try {
      const output = execFileSync(
        shellPath,
        ["-ilc", `command -v ${command}`],
        {
          encoding: "utf8",
          env: env as NodeJS.ProcessEnv,
          stdio: ["ignore", "pipe", "ignore"],
        },
      ).trim();

      if (output) {
        return output;
      }
    } catch {
      // ignore and try next shell
    }
  }

  return null;
};

export const resolveMcpCommand = (
  command: string,
  env: Record<string, string>,
): string => {
  const normalized = command.trim();
  if (!normalized) {
    throw new Error("MCP 本地服务命令不能为空");
  }

  if (path.isAbsolute(normalized) || hasPathSeparator(normalized)) {
    return normalized;
  }

  const pathValue = env[PATH_KEY] ?? process.env[PATH_KEY];
  const executable = findExecutableInPath(normalized, pathValue);
  if (executable) {
    return executable;
  }

  const shellResolved = lookupWithLoginShell(normalized, env);
  if (shellResolved) {
    return shellResolved;
  }

  throw new Error(
    `未找到可执行命令 "${normalized}"。请检查 PATH 配置，或在 MCP 服务配置中填写绝对路径。`,
  );
};
