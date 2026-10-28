import { describe, expect, it } from "vitest";
import { assertCurrentProviderSettings } from "../provider-settings";

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
    expect(() => assertCurrentProviderSettings({})).not.toThrow();
    expect(() => assertCurrentProviderSettings(setting)).not.toThrow();
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
    { ttsProviders: {} },
    { embeddingProvider: { currentConfigId: "embedding-default-local", configs: [] } },
  ])("拒绝未支持的输入且不转换：%j", setting => {
    const before = structuredClone(setting);
    expect(() => assertCurrentProviderSettings(setting)).toThrow("SETTING_INVALID");
    expect(setting).toEqual(before);
  });
});
