import { describe, expect, it } from "vitest";
import {
  OTHER_KEY,
  bucketStarts,
  buildTrendSeries,
  changeRatio,
  featureLabel,
  formatCost,
  formatTokens,
  resolveRange,
} from "../sections/modelUsageData";

const at = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();

describe("resolveRange", () => {
  it("近 7 天 = 含今天的 7 个自然日，按天分桶，环比取前 7 天", () => {
    const now = at(2026, 9, 10, 15);
    const range = resolveRange("7d", now);
    expect(range.from).toBe(at(2026, 9, 4));
    expect(range.to).toBe(at(2026, 9, 11));
    expect(range.bucket).toBe("day");
    expect(range.previous).toEqual({ from: at(2026, 8, 28), to: at(2026, 9, 4) });
    expect(bucketStarts(range)).toHaveLength(7);
  });

  it("今天按小时分桶，24 个桶", () => {
    const range = resolveRange("today", at(2026, 9, 10, 9));
    expect(range.bucket).toBe("hour");
    expect(bucketStarts(range)).toHaveLength(24);
    expect(bucketStarts(range)[0]).toBe(at(2026, 9, 10));
  });
});

describe("buildTrendSeries", () => {
  const starts = [0, 1, 2];
  const point = (bucketStart: number, key: string, cost: number) => ({
    bucketStart,
    key,
    calls: 1,
    totalTokens: 10,
    cost,
  });

  it("缺失的桶补 0，按合计倒序", () => {
    const { keys, values } = buildTrendSeries([point(0, "a", 1), point(2, "b", 5)], starts, "cost");
    expect(keys).toEqual(["b", "a"]);
    expect(values.a).toEqual([1, 0, 0]);
    expect(values.b).toEqual([0, 0, 5]);
  });

  it("超出 topN 的合并为「其他」，合计为 0 的分组不出现", () => {
    const { keys, values } = buildTrendSeries(
      [point(0, "a", 3), point(0, "b", 2), point(1, "c", 1), point(1, "d", 1), point(1, "z", 0)],
      starts,
      "cost",
      2
    );
    expect(keys).toEqual(["a", "b", OTHER_KEY]);
    expect(values[OTHER_KEY]).toEqual([0, 2, 0]);
  });
});

describe("格式化", () => {
  it("费用：小额保留 4 位，常规 2 位，大额取整", () => {
    expect(formatCost(0)).toBe("$0");
    expect(formatCost(0.00123)).toBe("$0.0012");
    expect(formatCost(3.456)).toBe("$3.46");
    expect(formatCost(1234.5)).toBe("$1,235");
  });

  it("Token 单位换算", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_345)).toBe("12.3K");
    expect(formatTokens(2_500_000)).toBe("2.50M");
  });

  it("环比：上一段为 0 时为 null", () => {
    expect(changeRatio(10, 0)).toBeNull();
    expect(changeRatio(15, 10)).toBeCloseTo(0.5);
  });

  it("功能名：槽名、生成任务、外部调用、未登记", () => {
    expect(featureLabel("webClip")).toBe("网页剪藏");
    expect(featureLabel("generation:mindmap")).toBe("生成·导图");
    expect(featureLabel("aiServer:chat")).toBe("外部调用·对话");
    expect(featureLabel("somethingNew")).toBe("somethingNew");
    expect(featureLabel(OTHER_KEY)).toBe("其他");
  });
});
