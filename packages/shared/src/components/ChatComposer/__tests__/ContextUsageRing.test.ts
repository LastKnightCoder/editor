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

  it("压缩后的估算接替旧读数，下一次实际用量接替估算", () => {
    const before = {
      inputTokens: 75_000,
      outputTokens: 5_000,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const compaction = { tokensBefore: 80_000, estimatedTokensAfter: 12_000, isCurrent: true };
    expect(getContextUsageSummary(100, before, compaction)).toMatchObject({
      usedTokens: 12_000,
      usedPercent: 12,
    });
    expect(
      getContextUsageSummary(
        100,
        { ...before, inputTokens: 15_000 },
        { ...compaction, isCurrent: false }
      )
    ).toMatchObject({ usedTokens: 20_000, usedPercent: 20 });
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
