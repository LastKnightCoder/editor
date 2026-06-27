import { describe, expect, it } from "vitest";
import {
  LLM_FEATURE_KEYS,
  normalizeEmbeddingApiConfigs,
  normalizeLlmConfigs,
  normalizeLlmUsageSettings,
  reconcileLlmUsageSettings,
  resolveEmbeddingCurrentConfig,
} from "../aiSettingsCompat";

describe("aiSettingsCompat", () => {
  it("不再暴露废弃的文档摘要 LLM 用途", () => {
    expect(LLM_FEATURE_KEYS).not.toContain("vibeLearningDocSummary");
  });

  it("会清理失效的 llmUsageSettings 引用", () => {
    const configs = normalizeLlmConfigs([
      {
        id: "p1",
        name: "provider-1",
        apiKey: "k1",
        baseUrl: "u1",
        models: [{ name: "m1", description: "d1", features: {} }],
      },
    ]);
    const usage = normalizeLlmUsageSettings({
      chat: { providerId: "p1", modelName: "m1" },
      titleSummary: { providerId: "p2", modelName: "m2" },
      webClip: { providerId: "p1", modelName: "missing-model" },
    });

    const reconciled = reconcileLlmUsageSettings(configs, usage);
    expect(reconciled.chat).toEqual({ providerId: "p1", modelName: "m1" });
    expect(reconciled.titleSummary).toBeNull();
    expect(reconciled.webClip).toEqual({ providerId: "p1", modelName: "m1" });
  });

  it("provider 或模型删除后会回退到可用配置", () => {
    const configsBefore = normalizeLlmConfigs([
      {
        id: "p1",
        name: "provider-1",
        apiKey: "",
        baseUrl: "",
        models: [
          { name: "m1", description: "", features: {} },
          { name: "m2", description: "", features: {} },
        ],
      },
    ]);
    const usageBefore = normalizeLlmUsageSettings({
      chat: { providerId: "p1", modelName: "m2" },
    });
    const usageWithModel = reconcileLlmUsageSettings(
      configsBefore,
      usageBefore,
    );
    expect(usageWithModel.chat).toEqual({ providerId: "p1", modelName: "m2" });

    const configsAfterDeleteModel = normalizeLlmConfigs([
      {
        id: "p1",
        name: "provider-1",
        apiKey: "",
        baseUrl: "",
        models: [{ name: "m1", description: "", features: {} }],
      },
    ]);
    const usageAfterDeleteModel = reconcileLlmUsageSettings(
      configsAfterDeleteModel,
      usageWithModel,
    );
    expect(usageAfterDeleteModel.chat).toEqual({
      providerId: "p1",
      modelName: "m1",
    });

    const usageAfterDeleteProvider = reconcileLlmUsageSettings(
      normalizeLlmConfigs([]),
      usageAfterDeleteModel,
    );
    expect(usageAfterDeleteProvider.chat).toBeNull();
  });

  it("embedding 仅保留 API 配置并可回退 currentConfigId", () => {
    const configs = normalizeEmbeddingApiConfigs([
      {
        id: "local",
        providerType: "local_python",
        name: "本地模型",
      },
      {
        id: "api-1",
        providerType: "remote_openai",
        name: "API-1",
        apiKey: "k1",
        baseUrl: "u1",
        currentModel: "text-embedding-3-small",
        models: [
          {
            name: "text-embedding-3-small",
            description: "",
            contextLength: 1536,
            distance: 0.3,
            features: { multimodal: false },
          },
        ],
      },
    ]);

    expect(configs).toHaveLength(1);
    expect(configs[0].id).toBe("api-1");
    expect(resolveEmbeddingCurrentConfig("missing", configs)).toBe("api-1");
  });

  it("无 API 配置时保留原 currentConfigId", () => {
    const configs = normalizeEmbeddingApiConfigs([
      {
        id: "local",
        providerType: "local_python",
        name: "本地模型",
      },
    ]);

    expect(configs).toHaveLength(0);
    expect(resolveEmbeddingCurrentConfig("local", configs)).toBe("local");
  });
});
