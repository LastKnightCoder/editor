import { afterEach, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { LocalPluginPreferences, readLocalPluginState } from "../local-state";

const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-local-state-"));
  roots.push(root);
  return { root, state: new LocalPluginPreferences(root) };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
it("旧内容状态优先，一次导入普通插件偏好；旧窗口不得覆盖新意图", async () => {
  const { root, state } = await setup();
  await writeFile(
    path.join(root, ".editor-enabled.json"),
    JSON.stringify({ "test.editor": false })
  );
  await state.load();
  await state.importBrowser({ "test.editor": true, "test.ui": true });
  await state.initialize({ "test.center": true, "test.zip": false });
  expect(state.enabled("test.editor", true)).toBe(false);
  expect(state.enabled("test.ui", false)).toBe(true);
  await state.set("test.ui", false);
  await state.importBrowser({ "test.ui": true });
  expect((await readLocalPluginState(root)).enabled).toEqual({
    "test.editor": false,
    "test.ui": false,
    "test.center": true,
    "test.zip": false,
  });
  await expect(readFile(path.join(root, ".editor-enabled.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("无效迁移不能丢失原文件，失败后可重试，主进程值不受损坏镜像影响", async () => {
  const { root, state } = await setup();
  await state.load();
  await state.set("test.saved", true);
  await expect(state.importBrowser({ "test.other": "bad" })).rejects.toThrow("无效");
  expect((await readLocalPluginState(root)).browserImported).toBe(false);
  await state.importBrowser({ "test.saved": "bad", "test.other": false });
  expect((await readLocalPluginState(root)).enabled["test.saved"]).toBe(true);
  await state.importBrowser(null);
});
it("落盘失败不改变内存意图，重试与重启保持一致", async () => {
  const { root, state } = await setup();
  await state.load();
  await state.set("test.ui", true);
  await rm(path.join(root, ".enabled.json"));
  await mkdir(path.join(root, ".enabled.json"));
  await expect(state.set("test.ui", false)).rejects.toThrow();
  expect(state.enabled("test.ui", false)).toBe(true);
  await rm(path.join(root, ".enabled.json"), { recursive: true });
  await state.set("test.ui", false);
  const restarted = new LocalPluginPreferences(root);
  await restarted.load();
  expect(restarted.enabled("test.ui", true)).toBe(false);
});
it("卸载后重新安装按来源取默认值，旧窗口迁移不复活卸载前意图", async () => {
  const { state } = await setup();
  await state.load();
  await state.importBrowser({ "test.ui": false });
  await state.forget("test.ui");
  await state.importBrowser({ "test.ui": false });
  await state.initialize({ "test.ui": true });
  expect(state.enabled("test.ui", false)).toBe(true);
});
