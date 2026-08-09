import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import {
  ContextUsageIndicator,
  getContextUsageSummary,
} from "../ContextUsageIndicator";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("上下文用量计算", () => {
  it("按输入加输出计算已用上下文，并按输入计算缓存比例", () => {
    expect(
      getContextUsageSummary(128, {
        inputTokens: 100_000,
        outputTokens: 2_000,
        cacheReadTokens: 40_000,
        cacheWriteTokens: 10_000,
      }),
    ).toMatchObject({
      totalTokens: 128_000,
      usedTokens: 102_000,
      usedPercent: 79.6875,
      cacheReadPercent: 40,
      cacheWritePercent: 10,
    });
  });

  it("在输入工具栏显示已用和总上下文", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => {
      root.render(
        React.createElement(ContextUsageIndicator, {
          contextWindowK: 128,
          usage: {
            inputTokens: 100_000,
            outputTokens: 2_000,
            cacheReadTokens: 40_000,
            cacheWriteTokens: 10_000,
          },
        }),
      );
    });

    expect(container.textContent?.replace(/\s/g, "")).toContain("102k/128k");
    expect(
      container.querySelector('[aria-label="查看上下文用量"]'),
    ).toBeTruthy();

    await act(async () => root.unmount());
  });
});
