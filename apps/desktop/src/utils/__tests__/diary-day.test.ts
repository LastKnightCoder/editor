import { describe, expect, it } from "vitest";
import { normalizeDiaryDay } from "../diary-day";

describe("normalizeDiaryDay", () => {
  it("按天的日期原样返回", () => {
    expect(normalizeDiaryDay("2025-11-13", 0)).toBe("2025-11-13");
  });

  it("旧周记键归一到该 ISO 周的周一，旧月记键归一到 1 日", () => {
    expect(normalizeDiaryDay("2025-W46", 0)).toBe("2025-11-10");
    expect(normalizeDiaryDay("2025-W01", 0)).toBe("2024-12-30");
    expect(normalizeDiaryDay("2025-03", 0)).toBe("2025-03-01");
  });

  it("无法识别时回落到创建时间当天", () => {
    expect(normalizeDiaryDay("坏的", new Date(2025, 0, 2, 10).getTime())).toBe("2025-01-02");
  });
});
