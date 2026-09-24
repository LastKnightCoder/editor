import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../quickAdd";

// 2026-09-24 周四 10:42
const NOW = new Date(2026, 8, 24, 10, 42);
const day = (m: number, d: number, y = 2026) => new Date(y, m - 1, d).getTime();
const calendars = [
  { id: 1, title: "工作" },
  { id: 2, title: "学习成长" },
];
const parse = (input: string, baseDate = day(9, 24)) =>
  parseQuickAdd(input, { baseDate, now: NOW, calendars });

describe("parseQuickAdd", () => {
  it("相对日期 + 时间范围 + 日历", () => {
    const r = parse("明天 15:00-16:30 评审日历方案 #工作");
    expect(r).toMatchObject({
      title: "评审日历方案",
      date: day(9, 25),
      startTime: 15 * 60,
      endTime: 16 * 60 + 30,
      calendarId: 1,
    });
    expect(r.hints).toEqual({ date: "明天", time: "15:00-16:30", calendar: "工作" });
  });

  it("中文时刻与时段", () => {
    expect(parse("下午3点半 组会")).toMatchObject({
      title: "组会",
      startTime: 15 * 60 + 30,
      endTime: 16 * 60 + 30,
    });
    expect(parse("明早9点 晨跑")).toMatchObject({ date: day(9, 25), startTime: 9 * 60 });
    expect(parse("今晚八点 读书会")).toMatchObject({ date: day(9, 24), startTime: 20 * 60 });
    expect(parse("中午12点 午饭")).toMatchObject({ startTime: 12 * 60 });
    expect(parse("3点到5点 写周报")).toMatchObject({ startTime: 15 * 60, endTime: 17 * 60 });
    expect(parse("上午10点15 站会")).toMatchObject({ startTime: 10 * 60 + 15 });
  });

  it("不带时段的 1–6 点按下午，7 点起保持原样", () => {
    expect(parse("3点 开会").startTime).toBe(15 * 60);
    expect(parse("9点 开会").startTime).toBe(9 * 60);
  });

  it("星期：本周已过的顺延到下周；下周固定下周", () => {
    expect(parse("周五 羽毛球").date).toBe(day(9, 25));
    expect(parse("周一 周会").date).toBe(day(9, 28));
    expect(parse("下周三 评审").date).toBe(day(9, 30));
    expect(parse("星期日 聚餐").date).toBe(day(9, 27));
  });

  it("绝对日期：月日、斜杠、几号；已过的月日算明年", () => {
    expect(parse("10月1日 国庆").date).toBe(day(10, 1));
    expect(parse("9/30 体检").date).toBe(day(9, 30));
    expect(parse("28号 交房租").date).toBe(day(9, 28));
    expect(parse("3月5日 牙医").date).toBe(day(3, 5, 2027));
  });

  it("无日期用选中日，无时间为全天", () => {
    const r = parse("整理书架", day(9, 26));
    expect(r).toMatchObject({
      title: "整理书架",
      date: day(9, 26),
      startTime: null,
      endTime: null,
    });
  });

  it("日历按名前缀匹配；不存在的标签留在标题里", () => {
    expect(parse("背单词 #学习").calendarId).toBe(2);
    const r = parse("背单词 #不存在");
    expect(r.calendarId).toBeNull();
    expect(r.title).toBe("背单词 #不存在");
  });
});
