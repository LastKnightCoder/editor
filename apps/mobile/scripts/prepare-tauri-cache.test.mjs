import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findStalePluginBuilds } from "./prepare-tauri-cache.mjs";

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tau-cache-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tauriDir = path.join(root, "src-tauri");
  const plugin = { name: "tauri-plugin-example", path: path.join(tauriDir, "plugins/example") };
  const targetDir = path.join(root, "custom-target");
  const permission = path.join(plugin.path, "permissions/default.toml");
  fs.mkdirSync(path.dirname(permission), { recursive: true });
  fs.writeFileSync(permission, "");
  function cache(profile, files, output = "") {
    const build = path.join(targetDir, profile, "build", `${plugin.name}-123`);
    fs.mkdirSync(path.join(build, "out"), { recursive: true });
    fs.writeFileSync(
      path.join(build, "out", `${plugin.name}-permission-files`),
      JSON.stringify(files)
    );
    fs.writeFileSync(path.join(build, "output"), output);
  }
  return { root, tauriDir, targetDir, plugins: [plugin], permission, cache };
}

// 从隔离源码目录复制 target 后，权限清单曾引用已删除的 release-src，导致 Android 发布中断。
test("源码搬迁后清理引用旧权限目录的目标缓存，即使旧文件仍存在", t => {
  const f = fixture(t);
  const oldPermission = path.join(f.root, "old-source/default.toml");
  fs.mkdirSync(path.dirname(oldPermission));
  fs.writeFileSync(oldPermission, "");
  f.cache("aarch64-linux-android/release", [oldPermission]);
  f.cache("debug", [path.join(f.root, "removed/default.toml")]);
  assert.deepEqual(
    findStalePluginBuilds(f).sort((a, b) => a.profile.localeCompare(b.profile)),
    [
      { profile: "dev", target: null, packages: [f.plugins[0].name] },
      { profile: "release", target: "aarch64-linux-android", packages: [f.plugins[0].name] },
    ]
  );
});

test("当前源码的有效缓存与尚未构建的目录不需要清理", t => {
  const f = fixture(t);
  assert.deepEqual(findStalePluginBuilds(f), []);
  f.cache("release", [f.permission]);
  assert.deepEqual(findStalePluginBuilds(f), []);
});

test("没有权限命令的插件也检查原生库路径是否过期", t => {
  const f = fixture(t);
  f.cache(
    "aarch64-linux-android/release",
    [],
    `cargo:android_library_path=${f.root}/removed/android\n`
  );
  assert.deepEqual(findStalePluginBuilds(f), [
    { profile: "release", target: "aarch64-linux-android", packages: [f.plugins[0].name] },
  ]);
});
