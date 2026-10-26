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
it("首次加载只创建当前状态文件，旧文件不导入也不删除", async () => {
  const { root, state } = await setup();
  const oldFile = path.join(root, ".editor-enabled.json");
  await writeFile(oldFile, JSON.stringify({ "test.editor": true }));
  await state.load();
  expect(state.enabled("test.editor", false)).toBe(false);
  expect(await readLocalPluginState(root)).toEqual({ version: 1, enabled: {} });
  expect(JSON.parse(await readFile(oldFile, "utf8"))).toEqual({ "test.editor": true });
});
it("当前启用状态恢复，损坏文件不会被空配置覆盖", async () => {
  const { root, state } = await setup();
  const file = path.join(root, ".enabled.json");
  await writeFile(file, JSON.stringify({ version: 1, enabled: { "test.saved": true } }));
  await state.load();
  expect(state.enabled("test.saved", false)).toBe(true);
  const invalid = JSON.stringify({ version: 1, enabled: { "test.saved": "bad" } });
  await writeFile(file, invalid);
  await expect(state.load()).rejects.toThrow("无效");
  expect(await readFile(file, "utf8")).toBe(invalid);
  expect(state.enabled("test.saved", false)).toBe(true);
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
it("卸载清除启用意图，重新发现默认停用", async () => {
  const { root, state } = await setup();
  await state.load();
  await state.set("test.ui", true);
  await state.forget("test.ui");
  expect(state.enabled("test.ui", false)).toBe(false);
  expect((await readLocalPluginState(root)).enabled).toEqual({});
});
