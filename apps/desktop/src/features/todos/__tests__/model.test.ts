import { describe, expect, it } from "vitest";
import type { TodoRecurrence } from "@/types";
import {
  bucketOf,
  dayWord,
  groupDeletionIds,
  habitCells,
  habitStats,
  isOpen,
  isOverdue,
  liveEntries,
  nextOccurrence,
  openRoots,
  recurrenceText,
  streakOf,
} from "../model";
import type { OccurrenceMark, TodoEntry, TodoSnapshot } from "../types";

/** 固定「现在」：2026-09-24 周四 14:20（本地时区） */
const NOW = new Date(2026, 8, 24, 14, 20).getTime();
const at = (m: number, d: number, h = 0, mi = 0) => new Date(2026, m - 1, d, h, mi).getTime();

function entry(partial: Partial<TodoEntry> = {}): TodoEntry {
  return {
    id: 1,
    groupId: 1,
    parentId: null,
    title: "任务",
    type: "normal",
    isCompleted: false,
    sortIndex: 1024,
    isArchived: false,
    createTime: at(9, 1),
    updateTime: at(9, 1),
    recurrence: null,
    occurrences: new Map(),
    noteLinks: [],
    childIds: [],
    ...partial,
  };
}

function rule(partial: Partial<TodoRecurrence>): TodoRecurrence {
  return {
    id: 1,
    todoItemId: 1,
    type: "daily",
    interval: 1,
    excludeHolidays: false,
    startDate: at(6, 1),
    createTime: at(6, 1),
    updateTime: at(6, 1),
    ...partial,
  };
}

function habit(rec: Partial<TodoRecurrence>, marks: [number, OccurrenceMark][] = []) {
  return entry({ type: "recurring", recurrence: rule(rec), occurrences: new Map(marks) });
}

describe("dayWord", () => {
  it("今天 / 明天 / 后天 / 本周内周几 / 其余月日", () => {
    expect(dayWord(at(9, 24, 9), NOW)).toBe("今天");
    expect(dayWord(at(9, 23), NOW)).toBe("昨天");
    expect(dayWord(at(9, 25), NOW)).toBe("明天");
    expect(dayWord(at(9, 26), NOW)).toBe("后天");
    expect(dayWord(at(9, 27), NOW)).toBe("周日");
    expect(dayWord(at(9, 28), NOW)).toBe("9月28日");
  });
});

describe("bucketOf", () => {
  it("截止任务按自然日分段（今天晚些时候到期仍在今天）", () => {
    expect(bucketOf(entry({ type: "deadline", dueAt: at(9, 23, 18) }), NOW)).toBe("overdue");
    expect(bucketOf(entry({ type: "deadline", dueAt: at(9, 24, 9) }), NOW)).toBe("today");
    expect(bucketOf(entry({ type: "deadline", dueAt: at(9, 25) }), NOW)).toBe("tomorrow");
    expect(bucketOf(entry({ type: "deadline", dueAt: at(9, 27) }), NOW)).toBe("week");
    expect(bucketOf(entry({ type: "deadline", dueAt: at(9, 28) }), NOW)).toBe("later");
    expect(bucketOf(entry(), NOW)).toBe("none");
  });

  it("周期任务按下一次计划日分段", () => {
    expect(bucketOf(habit({ type: "daily" }), NOW)).toBe("today");
    expect(bucketOf(habit({ type: "weekly", weekdays: [6] }), NOW)).toBe("week");
    expect(bucketOf(habit({ type: "weekly", weekdays: [1] }), NOW)).toBe("later");
  });
});

describe("完成态与逾期", () => {
  it("已完成的截止任务不算逾期", () => {
    expect(isOverdue(entry({ type: "deadline", dueAt: at(9, 20) }), NOW)).toBe(true);
    expect(isOverdue(entry({ type: "deadline", dueAt: at(9, 20), isCompleted: true }), NOW)).toBe(
      false
    );
  });

  it("周期任务的未完成 = 今天没打卡", () => {
    expect(isOpen(habit({ type: "daily" }), NOW)).toBe(true);
    expect(isOpen(habit({ type: "daily" }, [[at(9, 24), "done"]]), NOW)).toBe(false);
  });
});

describe("周期规则", () => {
  it("下一次计划日", () => {
    expect(nextOccurrence(rule({ type: "weekly", weekdays: [1] }), NOW)).toBe(at(9, 28));
    expect(nextOccurrence(rule({ type: "monthly", monthDay: 25 }), NOW)).toBe(at(9, 25));
    expect(nextOccurrence(rule({ type: "daily" }), NOW, 1)).toBe(at(9, 25));
  });

  it("规则文案：周一在前", () => {
    expect(recurrenceText(rule({ type: "weekly", weekdays: [4, 1] }))).toBe("每周一、四");
    expect(recurrenceText(rule({ type: "weekly", weekdays: [0, 6] }))).toBe("每周六、日");
    expect(recurrenceText(rule({ type: "monthly", monthDay: 25 }))).toBe("每月 25 日");
    expect(recurrenceText(rule({ type: "daily", interval: 2 }))).toBe("每 2 天");
    expect(recurrenceText(rule({ type: "weekdays" }))).toBe("工作日");
  });
});

describe("打卡统计", () => {
  it("连续打卡：今天未打不断链，跳过不断链，缺卡即断", () => {
    const three = habit({ type: "daily" }, [
      [at(9, 21), "done"],
      [at(9, 22), "done"],
      [at(9, 23), "done"],
    ]);
    expect(streakOf(three, NOW)).toBe(3);

    const skipped = habit({ type: "daily" }, [
      [at(9, 21), "done"],
      [at(9, 22), "skip"],
      [at(9, 23), "done"],
      [at(9, 24), "done"],
    ]);
    expect(streakOf(skipped, NOW)).toBe(3);

    const broken = habit({ type: "daily" }, [
      [at(9, 21), "done"],
      [at(9, 23), "done"],
    ]);
    expect(streakOf(broken, NOW)).toBe(1);
  });

  it("非计划日不参与连续计算", () => {
    const weekly = habit({ type: "weekly", weekdays: [1, 4] }, [
      [at(9, 17), "done"],
      [at(9, 21), "done"],
    ]);
    expect(streakOf(weekly, NOW)).toBe(2);
  });

  it("热力格按周列对齐：周一起、本周剩余日为 future", () => {
    const cells = habitCells(habit({ type: "daily" }), NOW);
    expect(cells).toHaveLength(84);
    expect(new Date(cells[0].day).getDay()).toBe(1);
    const lastWeek = cells.slice(-7).map(c => c.state);
    expect(lastWeek.slice(0, 3)).toEqual(["miss", "miss", "miss"]);
    expect(lastWeek[3]).toBe("today");
    expect(lastWeek.slice(4)).toEqual(["future", "future", "future"]);
  });

  it("完成率分母不含跳过与今天未打", () => {
    const h = habit({ type: "daily", startDate: at(9, 21) }, [
      [at(9, 21), "done"],
      [at(9, 22), "skip"],
    ]);
    // 计划日 9/21 done、9/22 skip、9/23 miss、9/24 today → 1 / (1 + 1)
    expect(habitStats(h, NOW)).toMatchObject({ done: 1, rate: 50, total: 1 });
  });
});

describe("liveEntries / openRoots（首页待办卡与待办页同口径）", () => {
  const group = (id: number) => ({
    id,
    title: `项目 ${id}`,
    sortIndex: id,
    isArchived: false,
    createTime: at(9, 1),
    updateTime: at(9, 1),
  });
  const entries = [
    entry({ id: 1, groupId: 1, title: "无日期" }),
    entry({ id: 2, groupId: 1, type: "deadline", dueAt: at(9, 20), title: "逾期" }),
    entry({ id: 3, groupId: 1, type: "deadline", dueAt: at(9, 24, 17), title: "今天" }),
    entry({ id: 4, groupId: 1, parentId: 1, title: "子任务" }),
    entry({ id: 5, groupId: 1, isCompleted: true, title: "已完成" }),
    entry({ id: 6, groupId: 2, title: "归档项目里的任务" }),
  ];
  const snapshot = {
    groups: [group(1)],
    archivedGroups: [{ ...group(2), isArchived: true }],
    entries,
    byId: new Map(entries.map(e => [e.id, e])),
  } as unknown as TodoSnapshot;

  it("已归档项目下的任务不可见，hidden 额外排除", () => {
    expect(liveEntries(snapshot).map(e => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(liveEntries(snapshot, new Set([2])).map(e => e.id)).toEqual([1, 3, 4, 5]);
  });

  it("只留未完成的顶层任务，按议程段排序（逾期 → 今天 → 无日期）", () => {
    expect(openRoots(liveEntries(snapshot), NOW).map(e => e.id)).toEqual([2, 3, 1]);
  });

  it("删除范围含跨项目挂着的子孙，环不死循环", () => {
    const e = (id: number, groupId: number, childIds: number[] = []) =>
      entry({ id, groupId, childIds });
    const list = [e(1, 1, [2]), e(2, 2, [3]), e(3, 2, [2]), e(4, 2)];
    const snap = { entries: list, byId: new Map(list.map(x => [x.id, x])) } as TodoSnapshot;
    expect([...groupDeletionIds(snap, 1)].sort()).toEqual([1, 2, 3]);
  });
});
