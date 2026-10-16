import { describe, expect, it } from "vitest";
import useSettingStore, {
  buildPersistedSettingSnapshot,
  mergeSettingWithDefaults,
} from "../useSettingStore";

describe("useSettingStore persistence snapshot", () => {
  it("退役的微信读书设置在合并与保存时丢弃（API Key 已归插件私有存储）", () => {
    const legacy = {
      ...structuredClone(useSettingStore.getState().setting),
      integration: {
        ...structuredClone(useSettingStore.getState().setting.integration),
        weread: { enabled: true, apiKey: "wrk-old" },
      },
    };
    const merged = mergeSettingWithDefaults(legacy);
    expect("weread" in merged.integration).toBe(false);
    expect("weread" in buildPersistedSettingSnapshot(legacy).integration).toBe(false);
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
});
