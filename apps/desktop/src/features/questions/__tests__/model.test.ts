import { describe, expect, it } from "vitest";
import type { QuestionEvent, QuestionSummary } from "@/types";
import { daySpan, describeEvent, relativeDay, sectionize, trajectoryStats } from "../model";

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 25, 10, 30).getTime();

const q = (id: number, status: QuestionSummary["status"], activity: number, resolved?: number) =>
  ({
    id,
    status,
    questionContent: `q${id}`,
    createTime: NOW - 10 * DAY,
    updateTime: activity,
    resolvedTime: resolved ?? null,
    answers: [],
    groupId: 1,
    sortIndex: id,
    linkCounts: {},
    lastActivityTime: activity,
  }) as QuestionSummary;

describe("问题页纯函数", () => {
  it("按探究中 / 待探究 / 已解答分段，空段不出现", () => {
    const sections = sectionize([
      q(1, "not_started", NOW - DAY),
      q(2, "in_progress", NOW - 3 * DAY),
      q(3, "in_progress", NOW - DAY),
    ]);
    expect(sections.map(s => [s.status, s.items.map(i => i.id)])).toEqual([
      ["in_progress", [3, 2]],
      ["not_started", [1]],
    ]);
  });

  it("已解答按解答时间倒序", () => {
    const [section] = sectionize([
      q(1, "resolved", NOW, NOW - 5 * DAY),
      q(2, "resolved", NOW - 9 * DAY, NOW - DAY),
    ]);
    expect(section.items.map(i => i.id)).toEqual([2, 1]);
  });

  it("相对日期与天数跨度", () => {
    expect(relativeDay(NOW - 2 * 3600_000, NOW)).toBe("今天");
    expect(relativeDay(NOW - DAY, NOW)).toBe("昨天");
    expect(relativeDay(NOW - 3 * DAY, NOW)).toBe("3 天前");
    expect(relativeDay(new Date(2026, 5, 1).getTime(), NOW)).toBe("6月1日");
    expect(daySpan(NOW - 2 * DAY, NOW)).toBe(3);
  });

  it("轨迹文案：新建与关联区分，自动推进单独描述", () => {
    const event = (type: QuestionEvent["type"], payload: object) =>
      ({ id: 1, questionId: 1, type, payload, createTime: NOW }) as QuestionEvent;
    expect(
      describeEvent(event("link", { targetType: "card", created: true, title: "t" }))
    ).toMatchObject({
      tone: "made",
      verb: "写下卡片",
    });
    expect(describeEvent(event("link", { targetType: "white_board", title: "t" })).verb).toBe(
      "关联白板"
    );
    expect(describeEvent(event("status", { to: "in_progress", auto: true })).verb).toBe(
      "挂上第一份材料，进入探究中"
    );
    expect(
      trajectoryStats(
        { status: "in_progress", createTime: NOW - 2 * DAY },
        3,
        [event("note", { text: "x" })],
        NOW
      )
    ).toBe("第 3 天 · 3 份材料 · 1 条记录");
  });
});
