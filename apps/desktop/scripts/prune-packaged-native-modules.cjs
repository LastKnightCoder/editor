const fs = require("node:fs");
const path = require("node:path");

const removeDir = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
};

const removeEntries = (nodeModulesDir, entries) => {
  for (const entry of entries) {
    removeDir(path.join(nodeModulesDir, entry));
  }
};

const keepOnly = (targetDir, keepNames) => {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  const keep = new Set(keepNames);
  for (const entry of fs.readdirSync(targetDir)) {
    if (!keep.has(entry)) {
      removeDir(path.join(targetDir, entry));
    }
  }
};

const pruneCommonBuildArtifacts = (nodeModulesDir) => {
  removeEntries(nodeModulesDir, [
    "better-sqlite3/bin",
    "better-sqlite3/deps",
    "better-sqlite3/src",
    "node-pty/deps",
    "node-pty/scripts",
    "node-pty/src",
  ]);

  keepOnly(path.join(nodeModulesDir, "better-sqlite3", "build", "Release"), [
    "better_sqlite3.node",
  ]);
  keepOnly(path.join(nodeModulesDir, "node-pty", "build", "Release"), [
    "conpty.node",
    "conpty_console_list.node",
    "pty.node",
    "winpty-agent.exe",
    "winpty.dll",
  ]);
};

exports.default = async (context) => {
  const nodeModulesDir = path.join(
    context.appOutDir,
    "resources",
    "app.asar.unpacked",
    "node_modules",
  );

  if (!fs.existsSync(nodeModulesDir)) {
    return;
  }

  const platform = context.electronPlatformName;

  pruneCommonBuildArtifacts(nodeModulesDir);

  if (platform === "win32") {
    removeEntries(nodeModulesDir, [
      "@img/sharp-darwin-arm64",
      "@img/sharp-darwin-x64",
      "@img/sharp-libvips-darwin-arm64",
      "@img/sharp-libvips-darwin-x64",
      "@myriaddreamin/typst-ts-node-compiler-darwin-arm64",
      "@myriaddreamin/typst-ts-node-compiler-darwin-x64",
      "@node-rs/jieba-darwin-arm64",
      "@node-rs/jieba-darwin-x64",
      "@tailwindcss/oxide-darwin-arm64",
      "@tailwindcss/oxide-darwin-x64",
      "sqlite-vec-darwin-arm64",
      "sqlite-vec-darwin-x64",
      "7zip-bin/linux",
      "7zip-bin/mac",
      "node-pty/prebuilds/darwin-arm64",
      "node-pty/prebuilds/darwin-x64",
      "node-pty/prebuilds/win32-arm64",
      "node-pty/third_party/conpty/1.23.251008001/win10-arm64",
    ]);
    return;
  }

  if (platform === "darwin") {
    removeEntries(nodeModulesDir, [
      "@img/sharp-win32-x64",
      "@myriaddreamin/typst-ts-node-compiler-win32-x64-msvc",
      "@node-rs/jieba-win32-x64-msvc",
      "@tailwindcss/oxide-win32-x64-msvc",
      "sqlite-vec-windows-x64",
      "7zip-bin/win",
      "7zip-bin/linux",
      "node-pty/prebuilds/win32-arm64",
      "node-pty/prebuilds/win32-x64",
      "node-pty/third_party/conpty",
    ]);
  }
};
