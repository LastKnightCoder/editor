import { spawn, spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pruneNativeModules from "./prune-packaged-native-modules.cjs";
import { assertPiPackagingBoundary } from "./pi-packaging-boundary.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");

assertPiPackagingBoundary(
  path.join(desktopDir, "node_modules", "@earendil-works", "pi-coding-agent"),
  [path.join(desktopDir, "src"), path.join(desktopDir, "src-electron")]
);

// 每个后端对应的 NODE_LLAMA_CPP_GPU 取值，用于缺失时显式指定补拉
const llamaBackendGpuEnv = {
  "win-x64": "false",
  "win-x64-vulkan": "vulkan",
  "linux-x64": "false",
  "linux-x64-vulkan": "vulkan",
};

// mac 两种架构都要出包，打包目标与 electron-builder.yml 的 mac.target 保持一致
const targetArchs = process.platform === "darwin" ? ["x64", "arm64"] : ["x64"];

// node-llama-cpp postinstall 默认 auto 会按打包机显卡决定是否下载 GPU 后端，
// 使产物内容依赖打包环境（无 GPU 的机器只会产出 CPU-only 包）。
// 打包前按 allowlist 显式补齐缺失后端，保证任何机器产物一致。
const ensureLlamaCppBackends = () => {
  const allowlist = targetArchs.flatMap(
    arch => pruneNativeModules.llamaBackendAllowlist(process.platform, arch) ?? []
  );
  if (allowlist.length === 0) {
    return;
  }

  const localPackageJson = path.join(desktopDir, "node_modules", "node-llama-cpp", "package.json");
  if (!existsSync(localPackageJson)) {
    console.warn("[llama-backends] node-llama-cpp not installed, skip backend sync");
    return;
  }

  // 后端位于 .pnpm 中包目录邻位的 node_modules 下，与 prune 脚本的解析规则一致
  const packageRealDir = path.dirname(realpathSync(localPackageJson));
  const cliEntry = path.join(packageRealDir, "dist", "cli", "cli.js");
  const storeBackendsDir = path.join(path.dirname(packageRealDir), "@node-llama-cpp");

  for (const backend of allowlist) {
    if (existsSync(path.join(storeBackendsDir, backend))) {
      continue;
    }

    // mac 后端是按 cpu 区分的可选依赖，只能由 pnpm 安装，postinstall 补拉不了
    if (process.platform === "darwin") {
      throw new Error(
        `[llama-backends] missing "${backend}": pnpm-workspace.yaml 的 supportedArchitectures 需包含 x64 与 arm64，修改后重新 pnpm install`
      );
    }

    const gpuEnv = llamaBackendGpuEnv[backend];
    if (!gpuEnv) {
      throw new Error(`[llama-backends] no NODE_LLAMA_CPP_GPU mapping for backend "${backend}"`);
    }

    console.log(
      `[llama-backends] fetching missing backend "${backend}" (NODE_LLAMA_CPP_GPU=${gpuEnv})`
    );
    const result = spawnSync(process.execPath, [cliEntry, "postinstall"], {
      cwd: desktopDir,
      env: { ...process.env, NODE_LLAMA_CPP_GPU: gpuEnv },
      stdio: "inherit",
    });
    if (result.status !== 0) {
      throw new Error(`[llama-backends] failed to fetch backend "${backend}"`);
    }
  }
};

ensureLlamaCppBackends();

const electronMirrorEnvKeys = [
  "ELECTRON_MIRROR",
  "ELECTRON_NIGHTLY_MIRROR",
  "ELECTRON_CUSTOM_DIR",
  "ELECTRON_CUSTOM_FILENAME",
  "ELECTRON_CUSTOM_VERSION",
  "NPM_CONFIG_ELECTRON_MIRROR",
  "NPM_CONFIG_ELECTRON_NIGHTLY_MIRROR",
  "NPM_CONFIG_ELECTRON_CUSTOM_DIR",
  "NPM_CONFIG_ELECTRON_CUSTOM_FILENAME",
  "NPM_CONFIG_ELECTRON_CUSTOM_VERSION",
  "npm_config_electron_mirror",
  "npm_config_electron_nightly_mirror",
  "npm_config_electron_customdir",
  "npm_config_electron_custom_dir",
  "npm_config_electron_customfilename",
  "npm_config_electron_custom_filename",
  "npm_config_electron_customversion",
  "npm_config_electron_custom_version",
  "npm_package_config_electron_mirror",
  "npm_package_config_electron_nightlyMirror",
  "npm_package_config_electron_nightly_mirror",
  "npm_package_config_electron_customDir",
  "npm_package_config_electron_custom_dir",
  "npm_package_config_electron_customFilename",
  "npm_package_config_electron_custom_filename",
  "npm_package_config_electron_customVersion",
  "npm_package_config_electron_custom_version",
];

const env = { ...process.env };

// electron-builder 26 下载 DMG 辅助二进制时会复用 @electron/get；
// 清理 Electron 本体镜像变量，避免把 builder-binaries 错拼到 electron 镜像目录。
for (const key of electronMirrorEnvKeys) {
  delete env[key];
}

const builderBin = path.join(
  desktopDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder"
);

// electron-builder 会按每个目标架构原地重编 better-sqlite3，mac 出完 x64 包后
// node_modules 里可能留着 x64 二进制；无论打包成败都换回本机架构，保证本地 dev 可用
const restoreHostNativeModules = () => {
  if (!targetArchs.some(arch => arch !== process.arch)) {
    return;
  }
  const rebuildBin = path.join(desktopDir, "node_modules", ".bin", "electron-rebuild");
  const result = spawnSync(rebuildBin, ["-f", "-w", "better-sqlite3", "--arch", process.arch], {
    cwd: desktopDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    console.warn(
      `[native] 未能把 better-sqlite3 恢复为本机架构 ${process.arch}，请手动执行 pnpm --filter desktop rebuild`
    );
  }
};

const isMac = process.platform === "darwin";
const builderArgs = process.argv.slice(2);
const child = spawn(
  isMac ? process.execPath : builderBin,
  isMac ? [path.join(__dirname, "run-mac-builder.mjs"), ...builderArgs] : builderArgs,
  {
    cwd: desktopDir,
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  }
);

child.on("exit", (code, signal) => {
  restoreHostNativeModules();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", error => {
  console.error(error);
  process.exit(1);
});
