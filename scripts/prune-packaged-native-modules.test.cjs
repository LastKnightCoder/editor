const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const {
  pruneJavaScriptSourceMaps,
  pruneBundledNativeBinaries,
} = require("../apps/desktop/scripts/prune-packaged-native-modules.cjs");

test("递归删除 JavaScript 调试映射，保留执行代码、类型、数据映射和二进制", () => {
  const root = fs.mkdtempSync(path.join(tmpdir(), "tau-package-maps-"));
  const directory = path.join(root, "dependency", "node_modules", "nested");
  fs.mkdirSync(directory, { recursive: true });
  const removed = ["index.js.map", "index.mjs.map", "index.cjs.map"];
  const kept = [
    "index.js",
    "index.d.ts",
    "index.d.ts.map",
    "data.json.map",
    "dictionary.map",
    "addon.node",
  ];
  try {
    for (const name of [...removed, ...kept]) fs.writeFileSync(path.join(directory, name), name);
    pruneJavaScriptSourceMaps(root);
    assert.deepEqual(fs.readdirSync(directory).sort(), kept.sort());
    for (const name of kept)
      assert.equal(fs.readFileSync(path.join(directory, name), "utf8"), name);
    pruneJavaScriptSourceMaps(root);
    assert.deepEqual(fs.readdirSync(directory).sort(), kept.sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const {
  findForeignPlatformToken,
  llamaBackendAllowlist,
} = require("../apps/desktop/scripts/prune-packaged-native-modules.cjs");

test("mac 两种架构的包互相排除对方的原生模块", () => {
  const armOnly = ["@img/sharp-darwin-arm64", "@node-llama-cpp/mac-arm64-metal", "darwin-arm64"];
  const intelOnly = ["@img/sharp-darwin-x64", "@node-llama-cpp/mac-x64", "darwin-x64"];
  for (const name of armOnly) {
    assert.equal(findForeignPlatformToken(name, "darwin", "arm64"), null, name);
    assert.ok(findForeignPlatformToken(name, "darwin", "x64"), name);
  }
  for (const name of intelOnly) {
    assert.equal(findForeignPlatformToken(name, "darwin", "x64"), null, name);
    assert.ok(findForeignPlatformToken(name, "darwin", "arm64"), name);
  }
  // 不带架构的 mac 包两边都保留，Windows 包两边都清掉
  assert.equal(findForeignPlatformToken("sqlite-vec-darwin", "darwin", "x64"), null);
  assert.equal(findForeignPlatformToken("@img/sharp-win32-x64", "darwin", "x64"), "win32");
});

test("mac 每个架构只带自己的 llama.cpp 后端", () => {
  assert.deepEqual(llamaBackendAllowlist("darwin", "arm64"), ["mac-arm64-metal"]);
  assert.deepEqual(llamaBackendAllowlist("darwin", "x64"), ["mac-x64"]);
  assert.deepEqual(llamaBackendAllowlist("win32", "x64"), ["win-x64", "win-x64-vulkan"]);
  assert.equal(llamaBackendAllowlist("darwin", "universal"), undefined);
});

test("嵌套的 pi 与 7zip 预编译程序只保留目标架构，不修改开发依赖", () => {
  for (const arch of ["x64", "arm64"]) {
    const root = fs.mkdtempSync(path.join(tmpdir(), "tau-prebuilds-"));
    const native = path.join(root, "@earendil-works", "pi-tui", "native");
    try {
      for (const platform of ["darwin", "win32", "linux"]) {
        for (const cpu of ["x64", "arm64"]) {
          const dir = path.join(native, platform, "prebuilds", `${platform}-${cpu}`);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, "addon.node"), "binary");
        }
      }
      fs.writeFileSync(path.join(native, "napi.h"), "header");
      for (const cpu of ["x64", "arm64"])
        fs.mkdirSync(path.join(root, "7zip-bin", "mac", cpu), { recursive: true });
      pruneBundledNativeBinaries(root, "darwin", arch);
      assert.deepEqual(fs.readdirSync(native).sort(), ["darwin", "napi.h"]);
      assert.deepEqual(fs.readdirSync(path.join(native, "darwin", "prebuilds")), [
        `darwin-${arch}`,
      ]);
      assert.deepEqual(fs.readdirSync(path.join(root, "7zip-bin", "mac")), [arch]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
