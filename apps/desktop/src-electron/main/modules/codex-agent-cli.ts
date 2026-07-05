import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

interface ResolveCodexCliPathOptions {
  env?: Record<string, string | undefined>;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
}

interface CreateCodexCliEnvironmentOptions {
  env?: Record<string, string | undefined>;
  electronPath?: string;
  runtimeDirectory?: string;
  extraPathEntries?: string[];
}

interface CodexCliRuntime {
  executablePath: string;
  pathDirs: string[];
  version?: string | null;
}

const CODEX_PATH_ENV_KEYS = ["TAU_CODEX_PATH", "CODEX_PATH"] as const;
const DEFAULT_NODE_SHIM_DIRECTORY = path.join(
  os.tmpdir(),
  `tau-codex-node-${process.pid}`,
);

const getCaseInsensitiveEnvValue = (
  env: Record<string, string | undefined>,
  key: string,
) => {
  if (env[key] !== undefined) {
    return env[key];
  }
  const matchedKey = Object.keys(env).find(
    (candidate) => candidate.toLowerCase() === key.toLowerCase(),
  );
  return matchedKey ? env[matchedKey] : undefined;
};

const getPathEntries = (
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
) => {
  const entries = (getCaseInsensitiveEnvValue(env, "PATH") ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const homeDir = getCaseInsensitiveEnvValue(env, "HOME") || os.homedir();
  const pnpmHome = getCaseInsensitiveEnvValue(env, "PNPM_HOME")?.trim();
  const localAppData = getCaseInsensitiveEnvValue(env, "LOCALAPPDATA")?.trim();
  const appData = getCaseInsensitiveEnvValue(env, "APPDATA")?.trim();

  if (pnpmHome) {
    entries.push(pnpmHome);
  }

  if (platform === "win32") {
    if (localAppData) {
      entries.push(path.join(localAppData, "pnpm"));
    }
    if (appData) {
      entries.push(path.join(appData, "npm"));
    }
  }

  if (platform === "darwin") {
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

const getExecutableNames = (platform: NodeJS.Platform = process.platform) =>
  platform === "win32" ? ["codex.exe", "codex.cmd", "codex"] : ["codex"];

const isExecutableFile = (
  filePath: string,
  platform: NodeJS.Platform = process.platform,
) => {
  try {
    if (!statSync(filePath).isFile()) {
      return false;
    }
    if (platform === "win32") {
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

const getPathEnvKey = (env: Record<string, string | undefined>) => {
  if (process.platform !== "win32") {
    return "PATH";
  }
  const keys = Object.keys(env).filter((key) => key.toLowerCase() === "path");
  return keys.includes("Path") ? "Path" : (keys[0] ?? "Path");
};

const getCodexTargetTriple = (
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
) => {
  if (platform === "win32") {
    if (arch === "arm64") {
      return "aarch64-pc-windows-msvc";
    }
    return "x86_64-pc-windows-msvc";
  }
  return null;
};

const existingDirs = (dirs: string[]) =>
  dirs.filter((dir) => {
    try {
      return statSync(dir).isDirectory();
    } catch {
      return false;
    }
  });

const resolveNativeCodexFromPackageRoot = (
  packageRoot: string,
  targetTriple: string,
): CodexCliRuntime | null => {
  const vendorRoot = path.join(packageRoot, "vendor", targetTriple);
  const runtimes = [
    {
      executablePath: path.join(vendorRoot, "bin", "codex.exe"),
      pathDirs: [path.join(vendorRoot, "codex-path")],
    },
    {
      executablePath: path.join(vendorRoot, "codex", "codex.exe"),
      pathDirs: [path.join(vendorRoot, "path")],
    },
  ];

  const runtime =
    runtimes.find((runtime) =>
      isExecutableFile(runtime.executablePath, "win32"),
    ) ?? null;
  if (!runtime) {
    return null;
  }

  return {
    executablePath: runtime.executablePath,
    pathDirs: existingDirs(runtime.pathDirs),
    version: readPackageVersion(packageRoot),
  };
};

const readPackageVersion = (packageRoot: string): string | null => {
  try {
    const raw = readFileSync(path.join(packageRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : null;
  } catch {
    return null;
  }
};

const getPackageRootFromCodexJsPath = (shimDir: string, rawPath: string) => {
  const expandedPath = rawPath
    .replaceAll("%~dp0\\", `${shimDir}\\`)
    .replaceAll("%~dp0/", `${shimDir}/`)
    .replaceAll("$basedir/", `${shimDir}/`)
    .replaceAll("$basedir\\", `${shimDir}\\`);
  return path.resolve(shimDir, expandedPath, "..", "..");
};

const getPackageRootsFromShim = (shimPath: string) => {
  const shimDir = path.dirname(shimPath);
  const roots = [
    path.join(shimDir, "node_modules", "@openai", "codex"),
    path.join(shimDir, "..", "@openai", "codex"),
  ];

  try {
    const content = readFileSync(shimPath, "utf8");
    const matches = content.matchAll(
      /["']?([^"'\r\n]*(?:node_modules[\\/]@openai[\\/]codex|@openai\+codex@[^"'\\/\r\n]+[\\/]node_modules[\\/]@openai[\\/]codex)[\\/]bin[\\/]codex\.js)["']?/gi,
    );
    for (const match of matches) {
      if (match[1]) {
        roots.push(getPackageRootFromCodexJsPath(shimDir, match[1]));
      }
    }
  } catch {
    // 读取 shim 失败时仍尝试常见 npm 全局与 node_modules/.bin 布局。
  }

  return Array.from(new Set(roots.map((root) => path.normalize(root))));
};

const getPnpmStorePackageRoot = (
  packageRoot: string,
  targetTriple: string,
): string | null => {
  const version = readPackageVersion(packageRoot);
  if (!version) {
    return null;
  }

  const platformSuffix =
    targetTriple === "aarch64-pc-windows-msvc" ? "win32-arm64" : "win32-x64";
  const marker = `${path.sep}node_modules${path.sep}@openai${path.sep}codex`;
  const markerIndex = packageRoot.lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const pnpmEntryRoot = packageRoot.slice(0, markerIndex);
  const pnpmRoot = path.dirname(pnpmEntryRoot);
  return path.join(
    pnpmRoot,
    `@openai+codex@${version}-${platformSuffix}`,
    "node_modules",
    "@openai",
    "codex",
  );
};

const resolveWindowsShimRuntime = (
  shimPath: string,
  arch: NodeJS.Architecture,
): CodexCliRuntime | null => {
  const targetTriple = getCodexTargetTriple("win32", arch);
  if (!targetTriple) {
    return null;
  }

  for (const packageRoot of getPackageRootsFromShim(shimPath)) {
    const packageRoots = [
      packageRoot,
      getPnpmStorePackageRoot(packageRoot, targetTriple),
    ].filter((root): root is string => Boolean(root));

    for (const candidateRoot of packageRoots) {
      const runtime = resolveNativeCodexFromPackageRoot(
        candidateRoot,
        targetTriple,
      );
      if (runtime) {
        return {
          ...runtime,
          version: runtime.version ?? readPackageVersion(packageRoot),
        };
      }
    }
  }

  return null;
};

const getCodexCliVersion = (
  executablePath: string,
  env: Record<string, string | undefined> = process.env,
) => {
  try {
    const result = spawnSync(executablePath, ["--version"], {
      env: toStringEnv(env) as NodeJS.ProcessEnv,
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    return output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1] ?? null;
  } catch {
    return null;
  }
};

const compareVersions = (left?: string | null, right?: string | null) => {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return -1;
  }
  if (!right) {
    return 1;
  }

  const leftParts = left.split(".").map((part) => Number(part) || 0);
  const rightParts = right.split(".").map((part) => Number(part) || 0);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
};

const chooseNewestRuntime = (
  runtimes: CodexCliRuntime[],
): CodexCliRuntime | null => {
  let best: CodexCliRuntime | null = null;
  for (const runtime of runtimes) {
    if (!best || compareVersions(runtime.version, best.version) > 0) {
      best = runtime;
    }
  }
  return best;
};

const dedupeRuntimes = (runtimes: CodexCliRuntime[]) => {
  const seen = new Set<string>();
  const result: CodexCliRuntime[] = [];
  for (const runtime of runtimes) {
    const key = path.normalize(runtime.executablePath).toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(runtime);
  }
  return result;
};

const resolveCodexCandidate = (
  candidate: string,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
  env: Record<string, string | undefined> = process.env,
): CodexCliRuntime | null => {
  if (!isExecutableFile(candidate, platform)) {
    return null;
  }

  if (platform === "win32") {
    const extension = path.extname(candidate).toLowerCase();
    if (extension === ".cmd" || extension === ".bat" || extension === "") {
      return resolveWindowsShimRuntime(candidate, arch);
    }
  }

  return {
    executablePath: candidate,
    pathDirs: [],
    version: getCodexCliVersion(candidate, env),
  };
};

const resolveCodexCandidates = (
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
) => {
  const runtimes: CodexCliRuntime[] = [];
  for (const dir of getPathEntries(env, platform)) {
    for (const name of getExecutableNames(platform)) {
      const candidate = path.join(dir, name);
      const runtime = resolveCodexCandidate(candidate, platform, arch, env);
      if (runtime) {
        runtimes.push(runtime);
      }
    }
  }

  return dedupeRuntimes(runtimes);
};

const resolveExplicitCodexRuntime = (
  configuredPath: string,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
) => {
  const runtime = resolveCodexCandidate(configuredPath, platform, arch);
  if (runtime) {
    return runtime;
  }
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
  extraPathEntries = [],
}: CreateCodexCliEnvironmentOptions = {}): Record<string, string> => {
  writeElectronNodeShim(runtimeDirectory, electronPath);
  const stringEnv = toStringEnv(env);
  const pathEnvKey = getPathEnvKey(stringEnv);
  for (const key of Object.keys(stringEnv)) {
    if (key.toLowerCase() === "path" && key !== pathEnvKey) {
      delete stringEnv[key];
    }
  }
  stringEnv[pathEnvKey] = [
    runtimeDirectory,
    ...extraPathEntries,
    ...getPathEntries(env),
  ].join(path.delimiter);

  return {
    ...stringEnv,
    ELECTRON_RUN_AS_NODE: "1",
  };
};

export const resolveCodexCliRuntime = ({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
}: ResolveCodexCliPathOptions = {}) => {
  for (const key of CODEX_PATH_ENV_KEYS) {
    const configuredPath = env[key]?.trim();
    if (configuredPath) {
      const runtime = resolveExplicitCodexRuntime(
        configuredPath,
        platform,
        arch,
      );
      if (runtime) {
        return runtime;
      }
      throw new Error(
        `${key} 指向的 Codex CLI 不存在或不可执行: ${configuredPath}`,
      );
    }
  }

  const runtime = chooseNewestRuntime(
    resolveCodexCandidates(env, platform, arch),
  );
  if (runtime) {
    return runtime;
  }

  throw new Error(
    "未找到本机 Codex CLI。请先运行 npm install -g @openai/codex，或通过 TAU_CODEX_PATH 指向 codex 可执行文件。",
  );
};

export const resolveCodexCliPath = (options: ResolveCodexCliPathOptions = {}) =>
  resolveCodexCliRuntime(options).executablePath;
