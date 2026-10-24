import { expect, it } from "vitest";
import {
  enqueueProviderConfigWrite,
  flushProviderConfigWrites,
  mergeProviderSettings,
  mergeTtsSettings,
} from "../provider-config";
import type { SettingCompat } from "../../types";

it("保存错误返回给本次调用，不阻断后续服务动作", async () => {
  await expect(
    enqueueProviderConfigWrite(async () => {
      throw "写入失败";
    })
  ).rejects.toThrow("写入失败");
  await expect(flushProviderConfigWrites()).resolves.toBeUndefined();
  await expect(enqueueProviderConfigWrite(async () => "next")).resolves.toBe("next");
});

it("配置操作按提交顺序执行，等待会覆盖当前在途保存", async () => {
  const events: string[] = [];
  let finish!: () => void;
  const first = enqueueProviderConfigWrite(async () => {
    events.push("first");
    await new Promise<void>(resolve => {
      finish = resolve;
    });
  });
  const second = enqueueProviderConfigWrite(async () => {
    events.push("second");
  });
  for (let attempt = 0; attempt < 10 && events.length === 0; attempt++) await Promise.resolve();
  expect(events).toEqual(["first"]);
  finish();
  await Promise.all([first, second, flushProviderConfigWrites()]);
  expect(events).toEqual(["first", "second"]);
});

it("权威快照只覆盖原生管理字段，保留仍在编辑的普通设置", () => {
  const previous = {
    database: { active: "A.db", databases: [] },
    speechInput: {
      active: "native",
      language: "zh-CN",
      plugin: { id: "", configurations: {} },
    },
    ttsProviders: [{ id: "old", name: "旧账号", pluginId: "old.tts", config: {}, models: [] }],
    ttsUsageSettings: { default: null },
    sync: { active: "plugin", plugin: { id: "old", configurations: {} }, autoSyncEnabled: true },
    imageBed: { active: "local", enableCompression: false, local: { path: "resources" } },
  } as SettingCompat;
  const snapshot = {
    database: { active: "B.db", databases: [{ name: "B.db", version: 7 }] },
    speechInput: {
      active: "plugin",
      language: "zh-CN",
      plugin: { id: "fixture.asr", configurations: {} },
    },
    ttsProviders: [
      {
        id: "a",
        name: "新账号",
        pluginId: "tau.tts-minimax",
        config: { apiKey: "new" },
        models: [{ id: "m1" }],
      },
    ],
    ttsUsageSettings: {
      default: { providerId: "a", modelId: "m1", voiceId: "voice" },
    },
    sync: {
      active: "plugin",
      plugin: { id: "fixture.sync", configurations: { "fixture.sync": { token: "fixture" } } },
      autoSyncEnabled: false,
    },
    imageBed: {
      active: "plugin",
      enableCompression: true,
      plugin: { id: "fixture.upload", configurations: {} },
      local: { path: "resources" },
    },
  } as SettingCompat;
  const result = mergeProviderSettings(previous, snapshot);
  expect(result.database.active).toBe("B.db");
  expect(result.speechInput).toEqual(snapshot.speechInput);
  expect(result.ttsProviders).toEqual(snapshot.ttsProviders);
  expect(result.ttsUsageSettings).toEqual(snapshot.ttsUsageSettings);
  expect(result.sync).toMatchObject({ plugin: { id: "fixture.sync" }, autoSyncEnabled: true });
  expect(result.imageBed.enableCompression).toBe(false);
  expect(result.imageBed.plugin?.id).toBe("fixture.upload");

  const ttsResult = mergeTtsSettings(previous, snapshot);
  expect(ttsResult.ttsProviders).toEqual(snapshot.ttsProviders);
  expect(ttsResult.ttsUsageSettings).toEqual(snapshot.ttsUsageSettings);
  expect(ttsResult.database).toBe(previous.database);
  expect(ttsResult.speechInput).toBe(previous.speechInput);
  expect(ttsResult.sync).toBe(previous.sync);
  expect(ttsResult.imageBed).toBe(previous.imageBed);
});
