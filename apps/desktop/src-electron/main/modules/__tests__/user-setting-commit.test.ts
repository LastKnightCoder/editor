// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type BackendWebSocketServer from "../../utils/BackendWebSocketServer";
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  move: vi.fn(),
  broadcast: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({
  default: { readFile: mocks.read, writeFile: mocks.write, rm: vi.fn(async () => undefined) },
}));
vi.mock("fs-extra/esm", () => ({ default: { pathExists: async () => true, move: mocks.move } }));
const initial = {
  imageBed: { active: "local" },
  ttsProviders: ["a", "b"].map(id => ({
    id,
    pluginId: "test.tts",
    name: id,
    models: [{ id: "model" }],
    config: { key: id },
  })),
};
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.read.mockResolvedValue(JSON.stringify(initial));
  mocks.write.mockResolvedValue(undefined);
  mocks.move.mockResolvedValue(undefined);
});
async function setup() {
  const { default: settings } = await import("../user-setting");
  await settings.init({
    addMessageHandler: vi.fn(),
    sendNotification: mocks.broadcast,
  } as unknown as BackendWebSocketServer);
  return settings;
}
it("落盘完成前不更新内存、不广播，成功后才通知", async () => {
  const settings = await setup(),
    listener = vi.fn();
  settings.onSettingChanged(listener);
  let finish!: () => void;
  mocks.move.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve;
      })
  );
  const saved = settings.updateTTSPlugin("a", "test.tts", { key: "new-a" }, [{ id: "model" }]);
  await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(1));
  expect((await settings.getSettingSnapshot()).ttsProviders[0].config).toEqual({ key: "a" });
  expect(mocks.broadcast).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
  finish();
  await saved;
  expect((await settings.getSettingSnapshot()).ttsProviders[0].config).toEqual({ key: "new-a" });
  expect(mocks.broadcast).toHaveBeenCalledTimes(1);
  expect(listener).toHaveBeenCalledTimes(1);
});
it("保存失败不发布新配置，相同配置可以重试，失败不阻塞后续队列", async () => {
  const settings = await setup();
  mocks.move.mockRejectedValueOnce(new Error("磁盘写入失败"));
  await expect(
    settings.updateTTSPlugin("a", "test.tts", { key: "new-a" }, [{ id: "model" }])
  ).rejects.toThrow("磁盘写入失败");
  expect((await settings.getSettingSnapshot()).ttsProviders).toEqual(initial.ttsProviders);
  expect(mocks.broadcast).not.toHaveBeenCalled();
  await settings.updateTTSPlugin("a", "test.tts", { key: "new-a" }, [{ id: "model" }]);
  expect(mocks.write).toHaveBeenCalledTimes(2);
  expect((await settings.getSettingSnapshot()).ttsProviders[0].config).toEqual({ key: "new-a" });
});
it("两个账号并发保存按最新已提交设置合并，不覆盖另一账号", async () => {
  const settings = await setup();
  await Promise.all([
    settings.updateTTSPlugin("a", "test.tts", { key: "new-a" }, [{ id: "model-a" }]),
    settings.updateTTSPlugin("b", "test.tts", { key: "new-b" }, [{ id: "model-b" }]),
  ]);
  expect(
    (await settings.getSettingSnapshot()).ttsProviders.map(
      (item: { config: unknown }) => item.config
    )
  ).toEqual([{ key: "new-a" }, { key: "new-b" }]);
  const last = JSON.parse(mocks.write.mock.calls[1][1]);
  expect(last.ttsProviders[0].models).toEqual([{ id: "model-a" }]);
  await expect(settings.updateTTSPlugin("a", "wrong.plugin", {}, [])).rejects.toThrow("归属");
});
it("全量提交在进入队列时复制输入，字段删除也会保存", async () => {
  const settings = await setup();
  const next = { marker: "saved" };
  const pending = settings.handleSetUserSetting(next);
  next.marker = "changed";
  await pending;
  expect(await settings.getSettingSnapshot()).toEqual({ marker: "saved" });
});
