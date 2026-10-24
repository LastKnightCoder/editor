import { beforeEach, expect, it, vi } from "vitest";
import type { PluginTtsMutation, SettingCompat } from "../../types";
import { flushProviderConfigWrites } from "../provider-config";
import {
  addTtsModel,
  createTtsAccount,
  deleteTtsAccount,
  deleteTtsModel,
  mutateTtsSettings,
  renameTtsAccount,
  saveTtsConfig,
  selectTtsUsage,
} from "../tts-settings";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  invalidate: vi.fn(),
  logPerf: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("../../features/calendar/cache", () => ({
  invalidateCalendarAfterMutation: mocks.invalidate,
}));
vi.mock("../../utils/perf", () => ({ logPerf: mocks.logPerf }));

const snapshot = {
  database: { active: "data.db", databases: [{ name: "data.db", version: 1 }] },
  sync: { active: "plugin", plugin: { id: "", configurations: {} } },
  imageBed: {
    active: "local",
    enableCompression: true,
    local: { path: "resources" },
  },
} as SettingCompat;

beforeEach(async () => {
  await flushProviderConfigWrites();
  mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(snapshot);
  mocks.invalidate.mockClear();
  mocks.logPerf.mockClear();
});

it("全部操作通过 plugin_tts_mutate 发送 camelCase mutation", async () => {
  const mutations: PluginTtsMutation[] = [
    { type: "create", pluginId: "tau.tts-minimax", name: "个人" },
    {
      type: "saveConfig",
      instanceId: "a",
      pluginId: "tau.tts-minimax",
      config: { apiKey: "key" },
      models: [{ id: "m1", label: "模型" }],
    },
    { type: "rename", instanceId: "a", name: "工作" },
    { type: "addModel", instanceId: "a", model: { id: "m2" } },
    { type: "deleteModel", instanceId: "a", modelId: "m2" },
    {
      type: "select",
      selection: { providerId: "a", modelId: "m1", voiceId: "voice" },
    },
    { type: "select", selection: null },
    { type: "deleteAccount", instanceId: "a" },
  ];

  await createTtsAccount("data.db", "tau.tts-minimax", "个人");
  await saveTtsConfig("data.db", "a", "tau.tts-minimax", { apiKey: "key" }, [
    { id: "m1", label: "模型" },
  ]);
  await renameTtsAccount("data.db", "a", "工作");
  await addTtsModel("data.db", "a", { id: "m2" });
  await deleteTtsModel("data.db", "a", "m2");
  await selectTtsUsage("data.db", { providerId: "a", modelId: "m1", voiceId: "voice" });
  await mutateTtsSettings("data.db", { type: "select", selection: null });
  await deleteTtsAccount("data.db", "a");

  expect(mocks.invoke.mock.calls).toHaveLength(mutations.length);
  mutations.forEach((mutation, index) => {
    expect(mocks.invoke).toHaveBeenNthCalledWith(index + 1, "plugin_tts_mutate", {
      database: "data.db",
      mutation,
    });
  });
});

it("TTS 操作共享 provider 写队列并按提交顺序调用原生命令", async () => {
  let finish!: (value: SettingCompat) => void;
  mocks.invoke.mockImplementationOnce(
    () =>
      new Promise<SettingCompat>(resolve => {
        finish = resolve;
      })
  );
  const first = createTtsAccount("data.db", "tau.tts-minimax", "个人");
  const second = deleteTtsAccount("data.db", "a");
  await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
  expect(mocks.invoke.mock.calls[0][1].mutation.type).toBe("create");
  finish(snapshot);
  await Promise.all([first, second, flushProviderConfigWrites()]);
  expect(mocks.invoke.mock.calls.map(call => call[1].mutation.type)).toEqual([
    "create",
    "deleteAccount",
  ]);
});

it("原生失败传给当前操作且不阻断后续 mutation", async () => {
  mocks.invoke.mockRejectedValueOnce(new Error("disk"));
  await expect(createTtsAccount("data.db", "tau.tts-minimax", "个人")).rejects.toThrow("disk");
  await expect(selectTtsUsage("data.db", null)).resolves.toBe(snapshot);
});
