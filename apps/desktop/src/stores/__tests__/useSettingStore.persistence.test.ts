import { describe, expect, it } from "vitest";
import useSettingStore, {
  buildPersistedSettingSnapshot,
  mergeSettingWithDefaults,
} from "../useSettingStore";

describe("useSettingStore persistence snapshot", () => {
  it.each([
    { backdrop: undefined, enabled: true, motion: true },
    { backdrop: { motion: false }, enabled: true, motion: false },
    { backdrop: { enabled: false }, enabled: false, motion: true },
    { backdrop: { enabled: true, motion: false }, enabled: true, motion: false },
  ])("升级后保留旧背景效果 $backdrop", ({ backdrop, enabled, motion }) => {
    const setting = mergeSettingWithDefaults({ appearance: { backdrop } });
    expect(setting.appearance?.backdrop).toEqual({ enabled, motion });
    const reloaded = mergeSettingWithDefaults(buildPersistedSettingSnapshot(setting));
    expect(reloaded.appearance?.backdrop).toEqual({ enabled, motion });
  });

  it("模型能力缺失时恢复为仅文字，保留已配置的能力且不编造费用和容量", () => {
    // 现场错误：不完整模型进入设置页后，能力标签读取 input.includes 导致整窗崩溃。
    const setting = JSON.parse(
      JSON.stringify({
        llmProviders: [
          {
            id: "custom",
            name: "Custom",
            baseUrl: "https://example.com/v1",
            apiKey: "",
            api: "openai-completions",
            models: [
              { id: "missing" },
              { id: "null", input: null, reasoning: null },
              {
                id: "vision",
                input: ["text", "image"],
                reasoning: true,
                contextWindow: 32000,
                maxTokens: 2048,
              },
            ],
          },
        ],
      })
    );

    const merged = mergeSettingWithDefaults(setting);
    expect(merged.llmProviders[0].models).toEqual([
      { id: "missing", input: ["text"], reasoning: false },
      { id: "null", input: ["text"], reasoning: false },
      setting.llmProviders[0].models[2],
    ]);
    expect(setting.llmProviders[0].models[0]).toEqual({ id: "missing" });
    const snapshot = buildPersistedSettingSnapshot(merged);
    expect(mergeSettingWithDefaults(JSON.parse(JSON.stringify(snapshot)))).toEqual(merged);
  });

  it("已迁出的 integration 账号设置在合并与保存时整体丢弃", () => {
    const legacy = {
      ...structuredClone(useSettingStore.getState().setting),
      integration: { weread: { enabled: true, apiKey: "wrk-old" }, bilibili: { enabled: true } },
    };
    expect("integration" in mergeSettingWithDefaults(legacy)).toBe(false);
    expect("integration" in buildPersistedSettingSnapshot(legacy)).toBe(false);
  });

  it("模板字段保持原值，不从宿主级旧描述转换", () => {
    const setting = {
      publish: { site: { templateId: "tau.blog", description: "旧描述", fields: {} } },
    } as never;
    expect(mergeSettingWithDefaults(setting).publish.site.fields).toEqual({});
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

  it("旧缓存携带的 embeddingProvider 键在合并时删除，避免回传被写入边界拒绝", () => {
    const legacy = {
      ...structuredClone(useSettingStore.getState().setting),
      embeddingProvider: { currentConfigId: "embedding-default-local", configs: [] },
    } as never;

    const merged = mergeSettingWithDefaults(legacy);

    expect("embeddingProvider" in merged).toBe(false);
    expect(merged.embedding).toEqual({
      active: null,
      local: { source: "modelscope", devicePolicy: "auto", batchSize: 8 },
      plugins: {},
    });
  });

  it("已激活的嵌入模型与插件连接配置合并时不被默认值污染", () => {
    const setting = {
      embedding: {
        active: { provider: "plugin", pluginId: "test.embedding", model: "m", dimensions: 3 },
        local: { source: "huggingface", devicePolicy: "cpu", batchSize: 16 },
        plugins: { "test.embedding": { config: { apiKey: "keep" } } },
      },
    } as never;

    const merged = mergeSettingWithDefaults(setting);

    expect(merged.embedding.active).toEqual({
      provider: "plugin",
      pluginId: "test.embedding",
      model: "m",
      dimensions: 3,
    });
    expect(merged.embedding.local).toEqual({
      source: "huggingface",
      devicePolicy: "cpu",
      batchSize: 16,
    });
    expect(merged.embedding.plugins).toEqual({ "test.embedding": { config: { apiKey: "keep" } } });
  });
});
