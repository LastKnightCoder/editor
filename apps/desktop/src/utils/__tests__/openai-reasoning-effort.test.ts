import { describe, expect, it } from "vitest";
import type { ModelConfig } from "@/types";
import {
  getReasoningEffortOptions,
  normalizeReasoningEffort,
} from "../openai-reasoning-effort";

const model = (name: string): ModelConfig => ({
  name,
  description: name,
  features: {
    online: false,
    thinking: true,
    image: false,
    video: false,
    audio: false,
    file: false,
  },
  apiProtocol: "responses",
});

const claudeModel = (name: string): ModelConfig => ({
  ...model(name),
  messageFormat: "claude",
});

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
    expect(getReasoningEffortOptions(model("gpt-5.1"))).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
  });

  it("其他模型保留原有档位，并在发送前降级不支持的强度", () => {
    const options = getReasoningEffortOptions(model("deepseek-reasoner"));

    expect(options).toEqual(["none", "low", "medium", "high"]);
    expect(normalizeReasoningEffort("max", options)).toBe("high");
  });

  it("根据 Claude 型号开放扩展档位", () => {
    expect(getReasoningEffortOptions(claudeModel("claude-opus-4-7"))).toEqual([
      "none",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
    expect(getReasoningEffortOptions(claudeModel("claude-sonnet-4-5"))).toEqual(
      ["none", "low", "medium", "high"],
    );
  });

  it("Claude thinking 永远开启时移除 none", () => {
    expect(getReasoningEffortOptions(claudeModel("claude-mythos-5"))).toEqual([
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
    ]);
  });
});
