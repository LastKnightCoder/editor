// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { migrateTTSSettings } from "../tts-settings-migration";

const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "tau-tts-migration-"));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

it("分别迁移多账号，保留模型顺序、当前选择和既有插件配置", async () => {
  const root = await setup();
  const setting = {
    ttsProviders: [
      {
        id: "a",
        name: "账号一",
        providerType: "minimax",
        apiKey: "key-a",
        models: [{ id: "custom", label: "自定义" }],
      },
      {
        id: "b",
        name: "账号二",
        providerType: "minimax",
        apiKey: "key-b",
        baseUrl: "https://example.test",
        models: [],
      },
      { id: "c", name: "千问", providerType: "qwen", apiKey: "key-c", models: [{ id: "qwen" }] },
      { id: "d", name: "新账号", pluginId: "example.tts", config: { value: "kept" }, models: [] },
    ],
    ttsUsageSettings: { default: { providerId: "b", modelId: "missing", voiceId: "voice-b" } },
    integration: { minimax: { apiKey: "old" }, podcastTTS: {}, github: { token: "kept" } },
    misc: { tts: { providersMigrated: true }, another: true },
  };
  const before = structuredClone(setting);
  const save = vi.fn();
  const next = await migrateTTSSettings(setting, root, save);
  expect(setting).toEqual(before);
  expect(next.ttsProviders).toEqual([
    {
      id: "a",
      name: "账号一",
      pluginId: "tau.tts-minimax",
      config: { apiKey: "key-a" },
      models: [{ id: "custom", label: "自定义" }],
    },
    {
      id: "b",
      name: "账号二",
      pluginId: "tau.tts-minimax",
      config: { apiKey: "key-b", baseUrl: "https://example.test" },
      models: [],
    },
    {
      id: "c",
      name: "千问",
      pluginId: "tau.tts-qwen",
      config: { apiKey: "key-c" },
      models: [{ id: "qwen" }],
    },
    setting.ttsProviders[3],
  ]);
  expect(next.ttsUsageSettings).toEqual(setting.ttsUsageSettings);
  expect(next.integration).toEqual({ github: { token: "kept" } });
  expect(next.misc).toEqual({ another: true });
  const files = await readdir(root);
  expect(files).toHaveLength(1);
  expect(JSON.parse(await readFile(path.join(root, files[0]), "utf8"))).toEqual(before);
  expect(await migrateTTSSettings(next, root, save)).toBe(next);
  expect(save).toHaveBeenCalledTimes(1);
});

it("更旧的单账号保留自定义模型及音色，不覆盖已有实例", async () => {
  const root = await setup();
  const setting = {
    integration: {
      minimax: { apiKey: " old " },
      podcastTTS: { minimaxModel: "custom", currentVoiceId: "voice" },
    },
  };
  const next = await migrateTTSSettings(setting, root, vi.fn());
  expect(next.ttsProviders).toMatchObject([
    {
      id: "minimax-legacy",
      config: { apiKey: " old " },
      models: [
        { id: "custom" },
        { id: "speech-2.8-hd" },
        { id: "speech-2.8-turbo" },
        { id: "speech-2.6-hd" },
        { id: "speech-2.6-turbo" },
      ],
    },
  ]);
  expect(next.ttsUsageSettings).toEqual({
    default: { providerId: "minimax-legacy", modelId: "custom", voiceId: "voice" },
  });
  const provider = { id: "new", pluginId: "example.tts", config: {}, models: [] };
  expect(
    (await migrateTTSSettings({ ...setting, ttsProviders: [provider] }, root, vi.fn())).ttsProviders
  ).toEqual([provider]);
});

it("未知提供方只备份并报错，不保存或丢弃原设置", async () => {
  const root = await setup();
  const setting = { ttsProviders: [{ id: "unknown", providerType: "unknown", apiKey: "kept" }] };
  const save = vi.fn();
  await expect(migrateTTSSettings(setting, root, save)).rejects.toThrow("无法迁移");
  expect(save).not.toHaveBeenCalled();
  expect(await readdir(root)).toHaveLength(1);
});

it("保存失败保留输入且可以重试", async () => {
  const root = await setup();
  const setting = { ttsProviders: [{ id: "a", providerType: "qwen", apiKey: "key", models: [] }] };
  const before = structuredClone(setting);
  await expect(
    migrateTTSSettings(setting, root, vi.fn().mockRejectedValue(new Error("disk")))
  ).rejects.toThrow("disk");
  expect(setting).toEqual(before);
  expect((await migrateTTSSettings(setting, root, vi.fn())).ttsProviders).toMatchObject([
    { pluginId: "tau.tts-qwen" },
  ]);
});

it("全新配置无需备份和保存", async () => {
  const root = await setup();
  const save = vi.fn();
  const setting = {};
  expect(await migrateTTSSettings(setting, root, save)).toBe(setting);
  expect(await readdir(root)).toEqual([]);
  expect(save).not.toHaveBeenCalled();
});

it("旧账号迁移后被用户删光，不从残留集成凭据复活", async () => {
  const setting = {
    ttsProviders: [],
    ttsUsageSettings: { default: null },
    integration: { minimax: { apiKey: "obsolete" } },
    misc: { tts: { providersMigrated: true } },
  };
  const next = await migrateTTSSettings(setting, await setup(), vi.fn());
  expect(next.ttsProviders).toEqual([]);
  expect(next.ttsUsageSettings).toEqual({ default: null });
  expect(next.integration).not.toHaveProperty("minimax");
});

it("混合字段以插件配置为准并移除旧字段，重启不重复迁移", async () => {
  const setting = {
    ttsProviders: [
      {
        id: "a",
        name: "账号",
        pluginId: "tau.tts-minimax",
        config: { apiKey: "current" },
        providerType: "minimax",
        apiKey: "obsolete",
        models: [],
      },
    ],
  };
  const root = await setup();
  const save = vi.fn();
  const next = await migrateTTSSettings(setting, root, save);
  expect(next.ttsProviders).toEqual([
    {
      id: "a",
      name: "账号",
      pluginId: "tau.tts-minimax",
      config: { apiKey: "current" },
      models: [],
    },
  ]);
  expect(await migrateTTSSettings(next, root, save)).toBe(next);
  expect(save).toHaveBeenCalledTimes(1);
});
