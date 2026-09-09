import { describe, expect, it } from "vitest";
import { formatDiaryPeriodLabel, getDiaryDateKey, shiftDiaryBaseDate } from "../dateKey";

describe("diary/dateKey", () => {
  it("daily 模式应使用 YYYY-MM-DD key，并支持按天偏移", () => {
    const key = getDiaryDateKey("daily", "2026-02-22");
    expect(key).toBe("2026-02-22");
    expect(shiftDiaryBaseDate("daily", "2026-02-22", 1)).toBe("2026-02-23");
    expect(shiftDiaryBaseDate("daily", "2026-02-22", -1)).toBe("2026-02-21");
  });

  it("weekly 模式应生成 YYYY-Www，并支持跨年周偏移", () => {
    expect(getDiaryDateKey("weekly", "2024-12-30")).toBe("2025-W01");
    expect(shiftDiaryBaseDate("weekly", "2024-12-30", 1)).toBe("2025-01-06");
    expect(shiftDiaryBaseDate("weekly", "2025-01-06", -1)).toBe("2024-12-30");
  });

  it("monthly 模式应生成 YYYY-MM，并支持跨年月份偏移", () => {
    expect(getDiaryDateKey("monthly", "2025-12-10")).toBe("2025-12");
    expect(shiftDiaryBaseDate("monthly", "2025-12-10", 1)).toBe("2026-01-10");
    expect(shiftDiaryBaseDate("monthly", "2026-01-10", -1)).toBe("2025-12-10");
  });

  it("格式化标题应返回可读中文文本", () => {
    const dailyLabel = formatDiaryPeriodLabel("daily", "2026-02-22");
    const weeklyLabel = formatDiaryPeriodLabel("weekly", "2024-12-30");
    const monthlyLabel = formatDiaryPeriodLabel("monthly", "2026-02-22");
    expect(dailyLabel).toContain("2026年02月22日");
    expect(weeklyLabel).toContain("2025年 第1周");
    expect(monthlyLabel).toBe("2026年02月");
  });
});
