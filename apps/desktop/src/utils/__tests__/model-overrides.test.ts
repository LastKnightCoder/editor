import { describe, expect, it } from "vitest";
import { getModelRequestOverrides } from "../model-overrides";

describe("model-overrides", () => {
  it.each(["k3", "k3-256k", "K3-Preview", "kimi-for-coding"])(
    "%s 不应再使用 Kimi/K3 特殊参数",
    (modelName) => {
      expect(
        getModelRequestOverrides({ modelName, reasoningEffort: "high" }),
      ).toEqual({});
    },
  );

  it("仍保留其他模型的通用兼容参数", () => {
    expect(
      getModelRequestOverrides({
        modelName: "claude-sonnet-4",
        reasoningEffort: "high",
      }),
    ).toEqual({ top_p: undefined });
  });
});
