import { expect, it } from "vitest";
import { normalizeSetting } from "../useSyncSettings";
import type { SettingCompat } from "../../types";

it("缺失或无效的 TTS 字段使用空安全默认值，不生成账号", () => {
  const normalized = normalizeSetting({
    integration: { minimax: { apiKey: "" } },
    ttsProviders: null,
    ttsUsageSettings: { default: { providerId: "missing" } },
  } as unknown as SettingCompat);
  expect(normalized.ttsProviders).toEqual([]);
  expect(normalized.ttsUsageSettings).toEqual({ default: null });
});

it("标准化保留已有 TTS 账号、模型与选择", () => {
  const provider = {
    id: "a",
    name: "账号",
    pluginId: "tau.tts-minimax",
    config: { apiKey: "key" },
    models: [{ id: "m1", label: "模型" }],
  };
  const selection = { providerId: "a", modelId: "m1", voiceId: "voice" };
  const normalized = normalizeSetting({
    ttsProviders: [provider],
    ttsUsageSettings: { default: selection },
  } as unknown as SettingCompat);
  expect(normalized.ttsProviders).toEqual([provider]);
  expect(normalized.ttsUsageSettings).toEqual({ default: selection });
});
