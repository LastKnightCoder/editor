import { describe, expect, it } from "vitest";
import { MIN_SCREEN_DOT_GAP, getDotGridLevel } from "../dotGridLevel";

describe("getDotGridLevel", () => {
  it("屏幕点距够大时直接用点距，次级点不透明", () => {
    expect(getDotGridLevel(20, 1)).toEqual({ step: 20, minorOpacity: 1 });
  });

  it("缩小到屏幕点距不足 10px 时点距翻倍，且只取 gridSize 的 2^k 倍（点始终落在吸附坐标上）", () => {
    for (const zoom of [0.2, 0.25, 0.33, 0.5, 0.75]) {
      const { step } = getDotGridLevel(20, zoom);
      const screenGap = step * zoom;
      expect(screenGap).toBeGreaterThanOrEqual(MIN_SCREEN_DOT_GAP);
      expect(screenGap).toBeLessThan(MIN_SCREEN_DOT_GAP * 2 + 1e-9);
      expect(Math.log2(step / 20) % 1).toBe(0);
    }
  });

  it("翻倍临界两侧视觉连续：两侧可见的都只有 40 倍数上的点", () => {
    // 临界之上：次级点（20）全透明，只剩主点（40）
    expect(getDotGridLevel(20, 0.5)).toEqual({ step: 20, minorOpacity: 0 });
    // 临界之下：次级点换成 40 且几乎不透明，主点是 80（落在 40 的点上）
    const justBelow = getDotGridLevel(20, 0.5 - 1e-6);
    expect(justBelow.step).toBe(40);
    expect(justBelow.minorOpacity).toBeCloseTo(1, 4);
  });
});
