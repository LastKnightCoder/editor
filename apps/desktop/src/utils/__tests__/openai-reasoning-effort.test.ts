import { describe, expect, it } from "vitest";
import type { LLMModelSetting, LLMProviderSetting } from "@/types/pi-llm";
import { getReasoningEffortOptions, normalizeReasoningEffort } from "../openai-reasoning-effort";

const model = (name: string): LLMModelSetting => ({
  id: name,
  reasoning: true,
  input: ["text"],
  contextWindow: 128_000,
  maxTokens: 8_192,
});

const claudeProvider: LLMProviderSetting = {
  id: "anthropic",
  name: "Anthropic",
  baseUrl: "https://api.anthropic.com",
  apiKey: "",
  api: "anthropic-messages",
  models: [],
};

describe("openai-reasoning-effort", () => {
  it("仅为官方 OpenAI GPT-5.6 开放 xhigh 与 max", () => {
    expect(getReasoningEffortOptions(model("gpt-5.6"))).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });

  it("GPT-5.2 至 GPT-5.5 只增加 xhigh", () => {
    expect(getReasoningEffortOptions(model("gpt-5.5"))).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
    ]);
    expect(getReasoningEffortOptions(model("gpt-5.1"))).toEqual(["none", "low", "medium", "high"]);
  });

  it("其他模型保留原有档位，并在发送前降级不支持的强度", () => {
    const options = getReasoningEffortOptions(model("deepseek-reasoner"));

    expect(options).toEqual(["none", "low", "medium", "high"]);
    expect(normalizeReasoningEffort("max", options)).toBe("high");
  });

  it("根据 Claude 型号开放扩展档位", () => {
    expect(getReasoningEffortOptions(model("claude-opus-4-7"), claudeProvider)).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(getReasoningEffortOptions(model("claude-sonnet-4-5"), claudeProvider)).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
  });

  it("Claude thinking 永远开启时移除 none", () => {
    expect(getReasoningEffortOptions(model("claude-mythos-5"), claudeProvider)).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});
