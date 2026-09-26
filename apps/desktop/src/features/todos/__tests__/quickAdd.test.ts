import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "../quickAdd";

/** 固定「现在」：2026-09-24 周四 14:20（本地时区） */
const NOW = new Date(2026, 8, 24, 14, 20).getTime();
const at = (m: number, d: number, h = 0, mi = 0) => new Date(2026, m - 1, d, h, mi).getTime();
const groups = [
  { id: 1, title: "编辑器重构" },
  { id: 2, title: "生活" },
];
const parse = (text: string) => parseQuickAdd(text, { now: NOW, groups });

describe("parseQuickAdd", () => {
  it("日期 + 时刻 + #项目 → 截止任务", () => {
    expect(parse("明天 17:00 交周报 #编辑器")).toEqual({
      title: "交周报",
      type: "deadline",
      dueAt: at(9, 25, 17),
      startAt: null,
      recurrence: null,
      groupId: 1,
    });
  });

  it("只写日期 = 全天截止（时间部分为 0）", () => {
    expect(parse("下周三 交报告")).toMatchObject({
      type: "deadline",
      dueAt: at(9, 30),
      title: "交报告",
    });
    expect(parse("10月3日 挑书单")).toMatchObject({ dueAt: at(10, 3), title: "挑书单" });
    expect(parse("周六 洗车")).toMatchObject({ dueAt: at(9, 26) });
  });

  it("时段 → 计划任务", () => {
    expect(parse("周六 10:00-12:00 读书")).toMatchObject({
      type: "planned",
      startAt: at(9, 26, 10),
      dueAt: at(9, 26, 12),
      title: "读书",
    });
  });

  it("周期词 → 周期任务（时刻不入库）", () => {
    expect(parse("每周一、四 周会")).toMatchObject({
      type: "recurring",
      recurrence: { type: "weekly", weekdays: [1, 4] },
      title: "周会",
    });
    expect(parse("每天 22:00 拉伸")).toMatchObject({
      type: "recurring",
      recurrence: { type: "daily" },
      title: "拉伸",
    });
    expect(parse("每月25号 交房租 #生活")).toMatchObject({
      recurrence: { type: "monthly", monthDay: 25 },
      groupId: 2,
      title: "交房租",
    });
  });

  it("口语时刻：晚上 8 点、已过去的时刻顺延到明天", () => {
    expect(parse("晚上8点 吃饭")).toMatchObject({ dueAt: at(9, 24, 20), title: "吃饭" });
    expect(parse("9:00 晨会")).toMatchObject({ dueAt: at(9, 25, 9), title: "晨会" });
  });

  it("与日程同一套日期词表：周末 / 大后天 / 几号 / 中文时刻 / 隐含时段", () => {
    expect(parse("周末 洗车")).toMatchObject({ type: "deadline", dueAt: at(9, 26), title: "洗车" });
    expect(parse("下周末 露营")).toMatchObject({ dueAt: at(10, 3) });
    expect(parse("大后天 还书")).toMatchObject({ dueAt: at(9, 27) });
    expect(parse("28号 交房租")).toMatchObject({ dueAt: at(9, 28), title: "交房租" });
    expect(parse("明早九点半 晨跑")).toMatchObject({ dueAt: at(9, 25, 9, 30), title: "晨跑" });
    expect(parse("明天下午3点到5点 写周报")).toMatchObject({
      type: "planned",
      startAt: at(9, 25, 15),
      dueAt: at(9, 25, 17),
      title: "写周报",
    });
  });

  it("未识别的内容原样作标题", () => {
    expect(parse("买猫粮")).toMatchObject({ type: "normal", title: "买猫粮", groupId: null });
    expect(parse("#不存在 整理桌面")).toMatchObject({ title: "#不存在 整理桌面", groupId: null });
  });
});
