import { describe, expect, it } from "vitest";
import { pastDayWord } from "../dayWords";

describe("pastDayWord", () => {
  const now = new Date(2026, 9, 22, 15).getTime();
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9).getTime();

  it("今天、昨天、一周内天数、其余月日，跨年带年份", () => {
    expect(pastDayWord(day(2026, 10, 22), now)).toBe("今天");
    expect(pastDayWord(day(2026, 10, 21), now)).toBe("昨天");
    expect(pastDayWord(day(2026, 10, 16), now)).toBe("6 天前");
    expect(pastDayWord(day(2026, 10, 15), now)).toBe("10月15日");
    expect(pastDayWord(day(2025, 12, 31), now)).toBe("2025年12月31日");
  });
});
