import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { afterEach, expect, it } from "vitest";
import { LocalPluginPreferences } from "../local-state";
import { openSyncPlugin } from "../sync-host";
import { validatePluginManifest } from "../package";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "tau-sync-plugin-"));
  roots.push(directory);
  const pluginId = "test.storage",
    root = path.join(directory, pluginId);
  await mkdir(root);
  const code =
    "module.exports.default = { id: 'test.storage', name:'test', open: async () => ({target:{identity:'test',label:'test'}, stat:async()=>null,read:async()=>null,write:async()=>({status:'written'}),list:async()=>({items:[],nextCursor:null}),remove:async()=>{},dispose:async()=>{}})};";
  const manifest = {
    formatVersion: 1,
    apiVersion: 1,
    id: pluginId,
    name: "test",
    version: "1.0.0",
    platform: "desktop",
    format: "cjs",
    main: "main.js",
    sync: "sync.js",
    integrity: {
      "main.js": "a".repeat(64),
      "sync.js": createHash("sha256").update(code).digest("hex"),
    },
  };
  await writeFile(path.join(root, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(root, "sync.js"), code);
  const prefs = new LocalPluginPreferences(directory);
  await prefs.load();
  return {
    directory,
    pluginId,
    root,
    manifest,
    prefs,
    clientVersion: "0.59.0",
    config: {},
    signal: new AbortController().signal,
  };
}
it("后台独立读取启用状态，不执行UI入口，摘要漂移拒绝运行", async () => {
  const options = await fixture();
  await expect(openSyncPlugin(options)).rejects.toThrow("尚未启用");
  await options.prefs.set(options.pluginId, true);
  const connection = await openSyncPlugin(options);
  expect(connection.target.identity).toBe("test");
  await connection.dispose();
  await writeFile(path.join(options.root, "sync.js"), "tampered");
  await expect(openSyncPlugin(options)).rejects.toThrow("摘要");
});
it("后台入口必须有独立路径与摘要，已取消任务不打开连接", async () => {
  const options = await fixture();
  expect(() => validatePluginManifest({ ...options.manifest, sync: "main.js" })).toThrow("相同");
  expect(() => validatePluginManifest({ ...options.manifest, sync: "../sync.js" })).toThrow("无效");
  expect(() =>
    validatePluginManifest({ ...options.manifest, integrity: { "main.js": "a".repeat(64) } })
  ).toThrow("摘要");
  await options.prefs.set(options.pluginId, true);
  const controller = new AbortController();
  controller.abort();
  await expect(openSyncPlugin({ ...options, signal: controller.signal })).rejects.toThrow();
});
