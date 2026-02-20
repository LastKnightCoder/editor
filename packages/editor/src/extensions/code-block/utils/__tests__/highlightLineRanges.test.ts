import { describe, expect, it } from "vitest";
import {
  hasHighlightedLineInRange,
  mergeHighlightRange,
  normalizeLineRange,
  parseHighlightLinesToSet,
  removeHighlightRange,
} from "../highlightLineRanges";

describe("highlightLineRanges", () => {
  it("应正确解析高亮行范围", () => {
    const lines = parseHighlightLinesToSet("2,4-6");
    expect(Array.from(lines).sort((a, b) => a - b)).toEqual([2, 4, 5, 6]);
  });

  it("应正确合并和删除高亮范围", () => {
    const merged = mergeHighlightRange("2,4-5", 3, 6);
    expect(merged).toBe("2-6");

    const removed = removeHighlightRange(merged, 4, 5);
    expect(removed).toBe("2-3,6");
  });

  it("应按选区命中判断是否可取消高亮", () => {
    expect(hasHighlightedLineInRange("2,5", 1, 1)).toBe(false);
    expect(hasHighlightedLineInRange("2,5", 1, 2)).toBe(true);
    expect(hasHighlightedLineInRange(undefined, 1, 2)).toBe(false);
  });

  it("应归一化反向范围输入", () => {
    expect(normalizeLineRange(6, 3)).toEqual([3, 6]);
  });
});
