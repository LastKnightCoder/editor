import { describe, expect, it } from "vitest";
import useSettingStore, {
  buildPersistedSettingSnapshot,
  mergeSettingWithDefaults,
} from "../useSettingStore";

describe("useSettingStore persistence snapshot", () => {
  it("已迁出的 integration 账号设置在合并与保存时整体丢弃", () => {
    const legacy = {
      ...structuredClone(useSettingStore.getState().setting),
      integration: { weread: { enabled: true, apiKey: "wrk-old" }, bilibili: { enabled: true } },
    };
    expect("integration" in mergeSettingWithDefaults(legacy)).toBe(false);
    expect("integration" in buildPersistedSettingSnapshot(legacy)).toBe(false);
  });

  it("旧的宿主级站点描述并入当前模板字段，不覆盖模板已有取值", () => {
    const site = (description: string, fields = {}) =>
      ({
        publish: {
          site: { templateId: "tau.blog", title: "", publicUrl: "", description, fields },
        },
      }) as never;
    const moved = mergeSettingWithDefaults(site("记录学习")).publish.site;
    expect(moved).not.toHaveProperty("description");
    expect(moved.fields["tau.blog"]).toEqual({ description: "记录学习" });
    const kept = mergeSettingWithDefaults(site("旧", { "tau.blog": { description: "新" } }));
    expect(kept.publish.site.fields["tau.blog"]).toEqual({ description: "新" });
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

  it("当前图片提供商不存在时清空选择，不改用其他付费账号", () => {
    const setting = structuredClone(useSettingStore.getState().setting);
    setting.imageGeneration = {
      currentProviderId: "deleted-provider",
      providers: [
        {
          id: "remaining-provider",
          name: "Remaining",
          pluginId: "test.images",
          config: { region: "a" },
          modelId: "model",
        },
      ],
    };

    const merged = mergeSettingWithDefaults(setting);

    expect(merged.imageGeneration.currentProviderId).toBe("");
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
