import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ContextUsageRing } from "../ContextUsageRing";
import { getContextUsageSummary } from "../contextUsage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("上下文用量计算", () => {
  it("按输入加输出计算已用上下文，并按输入计算缓存比例", () => {
    expect(
      getContextUsageSummary(128, {
        inputTokens: 100_000,
        outputTokens: 2_000,
        cacheReadTokens: 40_000,
        cacheWriteTokens: 10_000,
      })
    ).toMatchObject({
      totalTokens: 128_000,
      usedTokens: 102_000,
      usedPercent: 79.6875,
      cacheReadPercent: 40,
      cacheWritePercent: 10,
    });
  });

  it("用量环的无障碍标签给出已用和总上下文", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(ContextUsageRing, {
          contextWindowK: 128,
          usage: {
            inputTokens: 100_000,
            outputTokens: 2_000,
            cacheReadTokens: 40_000,
            cacheWriteTokens: 10_000,
          },
        })
      );
    });

    expect(container.querySelector('[aria-label="上下文用量 102k / 128k"]')).toBeTruthy();

    await act(async () => root.unmount());
  });
});
