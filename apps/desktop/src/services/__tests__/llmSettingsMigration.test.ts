import { describe, expect, it } from "vitest";
import { migrateLlmSettingsToV2 } from "../llmSettingsMigration";
import type { ModelConfig, ProviderConfig } from "@/types/llm";

const model = (overrides: Partial<ModelConfig> = {}): ModelConfig => ({
  name: "gpt-test",
  description: "",
  features: {
    online: true,
    thinking: false,
    image: false,
    video: false,
    audio: false,
    file: false,
  },
  ...overrides,
});

const provider = (overrides: Partial<ProviderConfig> = {}): ProviderConfig => ({
  id: "prov-1",
  name: "测试网关",
  apiKey: "sk-test",
  baseUrl: "https://gw.example.com/v1",
  models: [model()],
  ...overrides,
});

describe("migrateLlmSettingsToV2", () => {
  it("openai + chat-completions → openai-completions，claude → anthropic-messages，responses 透传", () => {
    const result = migrateLlmSettingsToV2({
      llmConfigs: [
        provider({
          id: "a",
          models: [model({ messageFormat: "openai", apiProtocol: "chat-completions" })],
        }),
        provider({ id: "b", models: [model({ name: "claude-x", messageFormat: "claude" })] }),
        provider({
          id: "c",
          models: [model({ name: "o-resp", messageFormat: "openai", apiProtocol: "responses" })],
        }),
        provider({ id: "d", models: [model({ name: "默认格式" })] }),
      ],
      llmUsageSettings: {},
    });
    const apiById = Object.fromEntries(result.providers.map(p => [p.id, p.api]));
    expect(apiById).toEqual({
      a: "openai-completions",
      b: "anthropic-messages",
      c: "openai-responses",
      d: "openai-completions",
    });
  });

  it("模型字段映射：contextWindowK/maxOutputTokens/temperature/userAgent/features", () => {
    const result = migrateLlmSettingsToV2({
      llmConfigs: [
        provider({
          models: [
            model({
              name: "deepseek-r",
              contextWindowK: 128,
              maxOutputTokens: 4096,
              temperature: 0.7,
              userAgent: "TauEditor/1.0",
              features: {
                online: true,
                thinking: true,
                image: false,
                video: true,
                audio: true,
                file: true,
              },
            }),
            model({
              name: "vision-model",
              features: {
                online: true,
                thinking: false,
                image: true,
                video: false,
                audio: false,
                file: false,
              },
            }),
            model({
              name: "legacy-multimodal",
              features: {
                online: false,
                thinking: false,
                image: false,
                video: false,
                audio: false,
                file: false,
                multimodal: true,
              },
            }),
          ],
        }),
      ],
      llmUsageSettings: {},
    });
    const [reasoningModel, visionModel, legacyModel] = result.providers[0].models;
    expect(reasoningModel).toMatchObject({
      id: "deepseek-r",
      reasoning: true,
      input: ["text"],
      contextWindow: 128 * 1024,
      maxTokens: 4096,
      samplingParams: { temperature: 0.7 },
      headers: { "User-Agent": "TauEditor/1.0" },
    });
    expect(visionModel.input).toEqual(["text", "image"]);
    // legacy multimodal 标志归并为 image 模态
    expect(legacyModel.input).toEqual(["text", "image"]);
  });

  it("未配置的数值字段落到默认值", () => {
    const result = migrateLlmSettingsToV2({ llmConfigs: [provider()], llmUsageSettings: {} });
    expect(result.providers[0].models[0]).toMatchObject({
      contextWindow: 128_000,
      maxTokens: 8_192,
    });
    expect(result.providers[0].models[0].samplingParams).toBeUndefined();
  });

  it("llmUsageSettings 的 modelName 改主键为 modelId，无效槽位丢弃并记录", () => {
    const result = migrateLlmSettingsToV2({
      llmConfigs: [provider({ models: [model({ name: "m1" })] })],
      llmUsageSettings: {
        chat: { providerId: "prov-1", modelName: "m1" },
        titleSummary: { providerId: "prov-1", modelName: "不存在的模型" },
        webClip: { providerId: "不存在的服务商", modelName: "m1" },
      },
    });
    expect(result.usage).toEqual({ chat: { providerId: "prov-1", modelId: "m1" } });
    expect(result.report.droppedUsageKeys.sort()).toEqual(["titleSummary", "webClip"]);
  });

  it("与 provider 主协议不一致的模型被跳过并记录原因", () => {
    const result = migrateLlmSettingsToV2({
      llmConfigs: [
        provider({
          models: [
            model({ name: "主格式模型", messageFormat: "openai" }),
            model({ name: "混入的 claude", messageFormat: "claude" }),
          ],
        }),
      ],
      llmUsageSettings: {},
    });
    expect(result.providers[0].models.map(m => m.id)).toEqual(["主格式模型"]);
    expect(result.report.skippedModels).toHaveLength(1);
    expect(result.report.skippedModels[0].modelName).toBe("混入的 claude");
  });

  it("幂等：空输入产出空结果", () => {
    const result = migrateLlmSettingsToV2({ llmConfigs: [], llmUsageSettings: {} });
    expect(result.providers).toEqual([]);
    expect(result.usage).toEqual({});
  });
});
