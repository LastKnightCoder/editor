// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { SyncProvider } from "@tau/plugins/sync";
import { PluginHost, createMemoryStorage } from "@tau/plugins/host";
import { RendererSyncRegistry } from "../../../../src/app/plugins/sync-registry";
vi.mock("electron", () => ({ app: { getVersion: () => "0.59.0" } }));
import { PluginSyncSessions } from "../plugin-sync";
const provider = (): SyncProvider => ({
  uploadFile: async () => true,
  downloadFile: async () => new Uint8Array([1]),
  fileExists: async () => false,
  createFileIfAbsent: async () => true,
  listFiles: async () => [],
});
async function fixture(create = () => provider()) {
  const registry = new RendererSyncRegistry();
  const host = new PluginHost({
    workspaceId: "test",
    storage: createMemoryStorage(),
    sync: registry,
  });
  host.registerTrusted({
    id: "test.sync",
    name: "test",
    version: "1.0.0",
    apiVersion: 1,
    create: () => ({
      activate(context) {
        context.sync.register({ id: context.pluginId, name: "test", create });
      },
    }),
  });
  await host.enable("test.sync");
  const send = vi.fn((_owner: number, request: Parameters<typeof registry.execute>[0]) =>
    registry.execute(request)
  );
  const sessions = new PluginSyncSessions(async () => {}, send);
  return { registry, host, sessions, send };
}
it("主进程只登记与转发，提供方由渲染注册表创建；会话按窗口归属", async () => {
  const create = vi.fn(provider),
    { sessions, host, send } = await fixture(create);
  const id = await sessions.begin(10, "test.sync", { bucket: "a" });
  expect(create).toHaveBeenCalledWith({ bucket: "a" });
  expect(send).toHaveBeenCalledWith(10, {
    kind: "open",
    session: id,
    pluginId: "test.sync",
    config: { bucket: "a" },
  });
  expect(await sessions.call(10, id, "uploadFile", ["file", new Uint8Array([1])])).toBe(true);
  await expect(sessions.call(11, id, "fileExists", ["file"])).rejects.toThrow("不属于");
  await expect(sessions.call(10, id, "fileExists", [1])).rejects.toThrow("文件名");
  await sessions.end(10, id);
  await expect(sessions.call(10, id, "fileExists", ["file"])).rejects.toThrow("结束");
  await host.dispose();
});
it("结束等待渲染端在途操作，期间不允许停用或更新", async () => {
  let finish!: () => void;
  const { sessions, host } = await fixture(() => ({
    ...provider(),
    uploadFile: () =>
      new Promise(resolve => {
        finish = () => resolve(true);
      }),
  }));
  const id = await sessions.begin(10, "test.sync", {});
  const write = sessions.call(10, id, "uploadFile", ["a", new Uint8Array()]);
  await Promise.resolve();
  const closing = sessions.end(10, id);
  await expect(sessions.protect("test.sync", async () => true)).rejects.toThrow("同步任务");
  finish();
  await write;
  await closing;
  expect(await sessions.protect("test.sync", async () => true)).toBe(true);
  await host.dispose();
});
it("窗口失效后不再调用插件，停用后不能创建新提供方", async () => {
  const { sessions, host } = await fixture();
  const id = await sessions.begin(10, "test.sync", {});
  sessions.releaseOwner(10);
  await expect(sessions.call(10, id, "fileExists", ["a"])).rejects.toThrow("结束");
  await host.disable("test.sync");
  await expect(sessions.begin(10, "test.sync", {})).rejects.toThrow("未在当前窗口启用");
  expect(sessions.busy).toBe(false);
  await host.dispose();
});
