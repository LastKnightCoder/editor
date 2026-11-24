import { describe, expect, it } from "vitest";
import { assertProviderSettingsShape } from "../provider-settings";

describe("服务设置格式边界", () => {
  it("接受空设置和当前插件账号，不改动配置或选用", () => {
    const setting = {
      sync: { active: "plugin", plugin: { id: "test.sync", configurations: {} } },
      imageBed: { active: "local", local: { path: "resources" }, enableCompression: false },
      publish: { active: "local", local: { basePath: "/" } },
      ttsProviders: [{ id: "voice", pluginId: "test.tts", config: { key: "keep" }, models: [] }],
      imageGeneration: { providers: [{ id: "image", pluginId: "test.images", config: {} }] },
      onlineVideo: { configurations: { "test.video": { token: "keep" } } },
      integration: { weread: { enabled: true } },
    };
    const before = structuredClone(setting);
    expect(() => assertProviderSettingsShape({})).not.toThrow();
    expect(() => assertProviderSettingsShape(setting)).not.toThrow();
    expect(setting).toEqual(before);
  });

  it.each([
    { sync: { active: "github" } },
    { imageBed: { active: "local", s3: { bucket: "old" } } },
    { publish: { active: "plugin", github: { repo: "old" } } },
    { integration: { minimax: { apiKey: "old" } } },
    { integration: { youtube: { proxy: "old" } } },
    { ttsProviders: [{ providerType: "qwen" }] },
    { imageGeneration: { providers: [{ pluginId: "test.images", providerType: "openai" }] } },
    { embeddingProvider: { currentConfigId: "embedding-default-local", configs: [] } },
  ])("未使用的服务字段不阻断设置且不转换：%j", setting => {
    const before = structuredClone(setting);
    expect(() => assertProviderSettingsShape(setting)).not.toThrow();
    expect(setting).toEqual(before);
  });

  it.each([
    null,
    [],
    { integration: [] },
    { sync: "plugin" },
    { imageBed: null },
    { publish: false },
    { ttsProviders: {} },
    { ttsProviders: [null] },
    { imageGeneration: [] },
    { imageGeneration: { providers: {} } },
    { imageGeneration: { providers: ["image"] } },
  ])("拒绝无法按对象或数组读取的结构：%j", setting => {
    expect(() => assertProviderSettingsShape(setting)).toThrow("SETTING_INVALID");
  });
});
