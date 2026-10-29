import { expect, it } from "vitest";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { resolveConfiguredModel, type AiModelConfig } from "../models";

const config = (): AiModelConfig => ({
  llmProviders: [
    {
      id: "custom",
      name: "自定义",
      baseUrl: "https://gateway.invalid/v1",
      api: "openai-completions",
      models: [{ id: "model", reasoning: false, input: ["text"] }],
    },
  ],
  llmUsageSettings: {},
});

it("目录外模型缺少容量时明确拒绝，不猜测窗口", () => {
  expect(() =>
    resolveConfiguredModel(config(), { providerId: "custom", modelId: "model" })
  ).toThrow(expect.objectContaining({ code: "AI_MODEL_METADATA_INCOMPLETE" }));
});

it("内置目录对协议和容量权威，提供方身份仍使用应用配置", () => {
  const builtin = getBuiltinModels("anthropic").find(model => model.api === "anthropic-messages");
  if (!builtin) throw new Error("SDK 缺少 Anthropic 目录");
  const value = config();
  value.llmProviders[0].builtin = "anthropic";
  value.llmProviders[0].models[0] = {
    id: builtin.id,
    input: ["text"],
    reasoning: false,
    contextWindow: 10,
    maxTokens: 1,
    api: "openai-completions",
  };
  const resolved = resolveConfiguredModel(value, { providerId: "custom", modelId: builtin.id });
  expect(resolved.model).toMatchObject({
    provider: "custom",
    api: "anthropic-messages",
    contextWindow: builtin.contextWindow,
    maxTokens: builtin.maxTokens,
    baseUrl: "https://gateway.invalid/v1",
  });
});

it("不存在的模型返回不可用，不按显示名或其他提供方匹配", () => {
  expect(() => resolveConfiguredModel(config(), { providerId: "other", modelId: "model" })).toThrow(
    expect.objectContaining({ code: "AI_MODEL_UNAVAILABLE" })
  );
});
