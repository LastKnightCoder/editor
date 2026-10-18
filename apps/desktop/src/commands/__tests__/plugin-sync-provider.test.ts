import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/app/plugins/sync-registry", () => ({
  rendererSyncRegistry: { execute: vi.fn(async () => true) },
}));
vi.mock("@/electron", () => ({ invoke: mock.invoke }));
vi.mock("@/commands/module-init", () => ({
  withModule: (_name: string, run: () => unknown) => run(),
}));
import { PluginSyncProvider } from "@/utils/sync/PluginSyncProvider";
beforeEach(() => {
  mock.invoke.mockReset();
});
it("一轮调用复用宿主任务登记，本地执行存储操作，结束时释放", async () => {
  mock.invoke.mockImplementation(async (channel: string) =>
    channel.endsWith("begin") ? "session" : true
  );
  const provider = new PluginSyncProvider("test.sync", { bucket: "a" });
  await Promise.all([provider.fileExists("a"), provider.fileExists("b")]);
  expect(mock.invoke.mock.calls.filter(call => call[0].endsWith("begin"))).toHaveLength(1);
  expect(mock.invoke.mock.calls.some(call => call[0] === "plugin-local:sync-call")).toBe(false);
  await provider.dispose();
  expect(mock.invoke).toHaveBeenLastCalledWith("plugin-local:sync-end", "session");
  await expect(provider.fileExists("c")).rejects.toThrow("结束");
});
it("后台加载失败仍可正常结束宿主任务，不留下伪造会话", async () => {
  mock.invoke.mockRejectedValue(new Error("未启用"));
  const provider = new PluginSyncProvider("test.sync", {});
  await expect(provider.fileExists("a")).rejects.toThrow("未启用");
  await provider.dispose();
  expect(mock.invoke).toHaveBeenCalledTimes(1);
});
