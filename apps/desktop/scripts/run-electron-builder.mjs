import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");

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
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);

const child = spawn(builderBin, process.argv.slice(2), {
  cwd: desktopDir,
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
