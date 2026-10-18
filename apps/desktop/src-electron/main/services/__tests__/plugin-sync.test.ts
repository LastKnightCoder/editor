// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { SyncProvider } from "@tau/plugins/sync";
vi.mock("electron", () => ({ app: { getVersion: () => "0.59.0" } }));
import { PluginSyncSessions } from "../plugin-sync";
const provider = (): SyncProvider => ({
  uploadFile: async () => true,
  downloadFile: async () => new Uint8Array([1]),
  fileExists: async () => false,
  createFileIfAbsent: async () => true,
  listFiles: async () => [],
});
it("配置在任务创建时传入，五个操作按窗口归属执行，结束后拒绝旧会话", async () => {
  const load = vi.fn(async () => provider()),
    sessions = new PluginSyncSessions(load);
  const id = await sessions.begin(10, "test.sync", { bucket: "a" });
  expect(load).toHaveBeenCalledWith("test.sync", { bucket: "a" });
  expect(await sessions.call(10, id, "uploadFile", ["file", new Uint8Array([1])])).toBe(true);
  await expect(sessions.call(11, id, "fileExists", ["file"])).rejects.toThrow("不属于");
  await expect(sessions.call(10, id, "fileExists", [1])).rejects.toThrow("文件名");
  await sessions.end(10, id);
  await expect(sessions.call(10, id, "fileExists", ["file"])).rejects.toThrow("结束");
});
it("加载和在途写入期间不能停用；窗口释放等待写入落定，不提前解除占用", async () => {
  let loaded!: (value: SyncProvider) => void, finish!: () => void;
  const sessions = new PluginSyncSessions(
    () =>
      new Promise(resolve => {
        loaded = resolve;
      })
  );
  const begin = sessions.begin(10, "test.sync", {});
  await Promise.resolve();
  await expect(sessions.protect("test.sync", async () => undefined)).rejects.toThrow("同步任务");
  loaded({
    ...provider(),
    uploadFile: () =>
      new Promise(resolve => {
        finish = () => resolve(true);
      }),
  });
  const id = await begin;
  const write = sessions.call(10, id, "uploadFile", ["file", new Uint8Array()]);
  await Promise.resolve();
  const closing = sessions.releaseOwner(10);
  await expect(sessions.protect("test.sync", async () => undefined)).rejects.toThrow("同步任务");
  finish();
  await write;
  await closing;
  await expect(sessions.protect("test.sync", async () => "done")).resolves.toBe("done");
});
it("修改状态与新任务互斥；加载失败不遗留占用", async () => {
  const sessions = new PluginSyncSessions(async () => {
    throw new Error("未启用");
  });
  await expect(sessions.begin(10, "test.sync", {})).rejects.toThrow("未启用");
  let done!: () => void;
  const change = sessions.protect(
    "test.sync",
    () =>
      new Promise<void>(resolve => {
        done = resolve;
      })
  );
  await expect(sessions.begin(10, "test.sync", {})).rejects.toThrow("正在修改");
  done();
  await change;
  await expect(sessions.protect("test.sync", async () => true)).resolves.toBe(true);
});
