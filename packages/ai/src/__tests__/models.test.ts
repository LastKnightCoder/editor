import { expect, it } from "vitest";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { resolveConfiguredModel, thinkingLevelsOf, type AiModelConfig } from "../models";

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

it("Kimi 官方旧地址使用目录中的新版请求地址，自定义网关保留原地址", () => {
  const builtin = getBuiltinModels("kimi-coding").find(model => model.api === "openai-completions");
  if (!builtin) throw new Error("SDK 缺少 Kimi Coding 模型");
  const value = config();
  const provider = value.llmProviders[0];
  provider.builtin = "kimi-coding";
  provider.api = "anthropic-messages";
  provider.baseUrl = "https://api.kimi.com/coding";
  provider.models[0].id = builtin.id;
  const ref = { providerId: provider.id, modelId: builtin.id };
  expect(resolveConfiguredModel(value, ref).model).toMatchObject({
    api: "openai-completions",
    baseUrl: "https://api.kimi.com/coding/v1",
    provider: provider.id,
  });
  expect(provider.baseUrl).toBe("https://api.kimi.com/coding");
  provider.baseUrl = "https://gateway.invalid/coding";
  expect(resolveConfiguredModel(value, ref).model.baseUrl).toBe(provider.baseUrl);
});

it("旧 Azure 目录标识仍可解析元数据，使用宿主支持的协议", () => {
  const builtin = getBuiltinModels("azure").find(model => model.api === "azure-openai-responses");
  if (!builtin) throw new Error("SDK 缺少 Azure Responses 模型");
  const value = config();
  const provider = value.llmProviders[0];
  provider.builtin = "azure-openai-responses";
  provider.api = "openai-responses";
  provider.models[0].id = builtin.id;
  const resolved = resolveConfiguredModel(value, { providerId: provider.id, modelId: builtin.id });
  expect(resolved.model).toMatchObject({
    api: "openai-responses",
    provider: provider.id,
    contextWindow: builtin.contextWindow,
    maxTokens: builtin.maxTokens,
  });
});

it("不存在的模型返回不可用，不按显示名或其他提供方匹配", () => {
  expect(() => resolveConfiguredModel(config(), { providerId: "other", modelId: "model" })).toThrow(
    expect.objectContaining({ code: "AI_MODEL_UNAVAILABLE" })
  );
});

it("思考档位：目录命中用真实档位，目录外按推理开关给通用档", () => {
  const builtin = getBuiltinModels("anthropic").find(
    model => model.api === "anthropic-messages" && model.reasoning
  );
  if (!builtin) throw new Error("SDK 缺少 Anthropic 推理模型");
  const value = config();
  const ref = { providerId: "custom", modelId: "model" };
  expect(thinkingLevelsOf(value.llmProviders, ref)).toEqual(["off"]);
  value.llmProviders[0].models[0].reasoning = true;
  expect(thinkingLevelsOf(value.llmProviders, ref)).toEqual(["off", "low", "medium", "high"]);
  value.llmProviders[0].builtin = "anthropic";
  value.llmProviders[0].models[0] = { id: builtin.id, input: ["text"], reasoning: false };
  const levels = thinkingLevelsOf(value.llmProviders, { ...ref, modelId: builtin.id });
  expect(levels).toEqual(getSupportedThinkingLevels(builtin));
  expect(levels).toContain("high");
  expect(thinkingLevelsOf(value.llmProviders, { ...ref, modelId: "不存在" })).toEqual(["off"]);
});
