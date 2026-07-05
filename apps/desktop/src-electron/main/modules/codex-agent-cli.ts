import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

interface ResolveCodexCliPathOptions {
  env?: Record<string, string | undefined>;
}

interface CreateCodexCliEnvironmentOptions {
  env?: Record<string, string | undefined>;
  electronPath?: string;
  runtimeDirectory?: string;
}

const CODEX_PATH_ENV_KEYS = ["TAU_CODEX_PATH", "CODEX_PATH"] as const;
const DEFAULT_NODE_SHIM_DIRECTORY = path.join(
  os.tmpdir(),
  `tau-codex-node-${process.pid}`,
);

const getPathEntries = (env: Record<string, string | undefined>) => {
  const entries = (env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const homeDir = env.HOME || os.homedir();
  const pnpmHome = env.PNPM_HOME?.trim();

  if (pnpmHome) {
    entries.push(pnpmHome);
  }

  if (process.platform === "darwin") {
    entries.push(
      "/opt/homebrew/bin",
      "/usr/local/bin",
      path.join(homeDir, "Library", "pnpm"),
      path.join(homeDir, ".local", "bin"),
      path.join(homeDir, ".local", "share", "pnpm"),
      path.join(homeDir, ".npm-global", "bin"),
      path.join(homeDir, ".bun", "bin"),
      path.join(homeDir, ".volta", "bin"),
    );
  }

  return Array.from(new Set(entries));
};

const getExecutableNames = () =>
  process.platform === "win32"
    ? ["codex.cmd", "codex.exe", "codex"]
    : ["codex"];

const isExecutableFile = (filePath: string) => {
  try {
    if (!statSync(filePath).isFile()) {
      return false;
    }
    if (process.platform === "win32") {
      return true;
    }
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

const toStringEnv = (env: Record<string, string | undefined>) => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
};

const writeElectronNodeShim = (
  runtimeDirectory: string,
  electronPath: string,
) => {
  mkdirSync(runtimeDirectory, { recursive: true });

  if (process.platform === "win32") {
    const shimPath = path.join(runtimeDirectory, "node.cmd");
    writeFileSync(
      shimPath,
      `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${electronPath}" %*\r\n`,
      "utf8",
    );
    return shimPath;
  }

  const shimPath = path.join(runtimeDirectory, "node");
  writeFileSync(
    shimPath,
    `#!/bin/sh\nexport ELECTRON_RUN_AS_NODE=1\nexec ${shellQuote(electronPath)} "$@"\n`,
    "utf8",
  );
  chmodSync(shimPath, 0o755);
  return shimPath;
};

export const createCodexCliEnvironment = ({
  env = process.env,
  electronPath = process.execPath,
  runtimeDirectory = DEFAULT_NODE_SHIM_DIRECTORY,
}: CreateCodexCliEnvironmentOptions = {}) => {
  writeElectronNodeShim(runtimeDirectory, electronPath);

  return {
    ...toStringEnv(env),
    ELECTRON_RUN_AS_NODE: "1",
    PATH: [runtimeDirectory, ...getPathEntries(env)].join(path.delimiter),
  };
};

export const resolveCodexCliPath = ({
  env = process.env,
}: ResolveCodexCliPathOptions = {}) => {
  for (const key of CODEX_PATH_ENV_KEYS) {
    const configuredPath = env[key]?.trim();
    if (configuredPath) {
      if (isExecutableFile(configuredPath)) {
        return configuredPath;
      }
      throw new Error(
        `${key} 指向的 Codex CLI 不存在或不可执行: ${configuredPath}`,
      );
    }
  }

  for (const dir of getPathEntries(env)) {
    for (const name of getExecutableNames()) {
      const candidate = path.join(dir, name);
      if (isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  throw new Error(
    "未找到本机 Codex CLI。请先运行 npm install -g @openai/codex，或通过 TAU_CODEX_PATH 指向 codex 可执行文件。",
  );
};
