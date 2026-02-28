import { describe, expect, it } from "vitest";
import {
  blendScore,
  normalizeRerankScores,
  resolvePositionWeight,
} from "../blend";
import { DEFAULT_SEARCH_CORE_CONFIG } from "../types";

describe("search-core/blend", () => {
  it("应按排名区间返回不同权重", () => {
    expect(resolvePositionWeight(1, DEFAULT_SEARCH_CORE_CONFIG)).toBe(0.75);
    expect(resolvePositionWeight(5, DEFAULT_SEARCH_CORE_CONFIG)).toBe(0.6);
    expect(resolvePositionWeight(20, DEFAULT_SEARCH_CORE_CONFIG)).toBe(0.4);
  });

  it("无 rerank 分数时应退化为 rrf 分数", () => {
    const score = blendScore({
      rank: 2,
      rrfScore: 0.33,
      rerankScore: undefined,
      config: DEFAULT_SEARCH_CORE_CONFIG,
    });
    expect(score).toBe(0.33);
  });

  it("应将非 0-1 rerank 分数归一化", () => {
    const normalized = normalizeRerankScores([-2, 0, 2]);
    expect(normalized.every((score) => score >= 0 && score <= 1)).toBe(true);
  });
});
