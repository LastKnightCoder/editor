import { describe, expect, it } from "vitest";
import useSettingStore, {
  buildPersistedSettingSnapshot,
  mergeSettingWithDefaults,
} from "../useSettingStore";

describe("useSettingStore persistence snapshot", () => {
  it("移除旧资源管理配置与排序，保留上传和同步设置", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    Object.assign(setting.module, { resourceManagement: { enable: true, name: "资源管理" } });
    setting.moduleOrder = ["card", "resourceManagement", "settings"];
    const merged = mergeSettingWithDefaults(setting);
    expect(merged.module).not.toHaveProperty("resourceManagement");
    expect(merged.moduleOrder).not.toContain("resourceManagement");
    expect(merged.moduleOrder.slice(0, 2)).toEqual(["card", "settings"]);
    expect(merged.imageBed).toEqual(setting.imageBed);
    expect(merged.sync).toEqual(setting.sync);
  });
  it("应保留 WeRead API Key，并在未配置时重置运行时连接状态", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.integration.weread = {
      ...setting.integration.weread,
      enabled: true,
      apiKey: "",
      connectionStatus: "valid",
      lastValidatedAt: 456,
      statusReason: "should reset",
      userInfo: {
        isConnected: true,
      },
    };

    const persisted = buildPersistedSettingSnapshot(setting);

    expect(persisted.integration.weread).toEqual({
      ...setting.integration.weread,
      enabled: false,
      connectionStatus: "unknown",
      lastValidatedAt: 0,
      statusReason: "",
      userInfo: {
        isConnected: false,
      },
    });
  });

  it("已配置 API Key 时也不应持久化 WeRead 运行时连接状态", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.integration.weread = {
      ...setting.integration.weread,
      enabled: true,
      apiKey: "wrk-test-key",
      connectionStatus: "valid",
      lastValidatedAt: 456,
      statusReason: "runtime status",
      userInfo: {
        isConnected: true,
      },
    };

    const persisted = buildPersistedSettingSnapshot(setting);

    expect(persisted.integration.weread).toEqual({
      ...setting.integration.weread,
      enabled: true,
      connectionStatus: "unknown",
      lastValidatedAt: 0,
      statusReason: "",
      userInfo: {
        isConnected: false,
      },
    });
  });

  it("合并设置时应替换图片提供商数组，避免已删除项被默认配置补回", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.imageGeneration = {
      currentProviderId: "",
      providers: [],
    };

    const merged = mergeSettingWithDefaults(setting);

    expect(merged.imageGeneration).toEqual({
      currentProviderId: "",
      providers: [],
    });
  });

  it("当前图片提供商不存在时应切换到第一个可用配置", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.imageGeneration = {
      currentProviderId: "deleted-provider",
      providers: [
        {
          id: "remaining-provider",
          name: "Remaining",
          providerType: "openai",
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          modelName: "gpt-image-2",
        },
      ],
    };

    const merged = mergeSettingWithDefaults(setting);

    expect(merged.imageGeneration.currentProviderId).toBe("remaining-provider");
    expect(merged.imageGeneration.providers).toHaveLength(1);
  });

  it("图片生成配置结构损坏时应兜底为空列表", () => {
    const setting = structuredClone(useSettingStore.getState().setting) as any;
    setting.imageGeneration = {
      currentProviderId: "broken",
      providers: "not-an-array",
    };

    const merged = mergeSettingWithDefaults(setting);

    expect(merged.imageGeneration).toEqual({
      currentProviderId: "",
      providers: [],
    });
  });

  it("合并设置时应清理废弃的文档摘要 LLM 用途", () => {
    const setting = structuredClone(useSettingStore.getState().setting) as any;
    setting.llmUsageSettings.vibeLearningDocSummary = {
      providerId: "legacy-provider",
      modelName: "legacy-model",
    };

    const merged = mergeSettingWithDefaults(setting) as any;

    expect(merged.llmUsageSettings.vibeLearningDocSummary).toBeUndefined();
  });
});
