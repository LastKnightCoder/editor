/**
 * 入场播放的时间轴：纯计算，时钟由引擎推进。
 */

import { describe, expect, it } from "vitest";
import {
  baseDuration,
  buildTimeline,
  revealAt,
  shownCount,
  springScale,
  timeAt,
} from "../core/timeline";
import type { GraphNode } from "../core/types";

const node = (id: number, createdAt: number): GraphNode => ({
  id,
  degree: 0,
  label: "",
  createdAt,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  fx: null,
  fy: null,
  radius: 5,
  cluster: -1,
  isBridge: false,
});

const DAY = 86_400_000;

describe("timeline", () => {
  it("按创建时间排序，最早的先出现", () => {
    const timeline = buildTimeline([node(3, 30 * DAY), node(1, 10 * DAY), node(2, 20 * DAY)]);
    expect(timeline.order).toEqual([1, 2, 3]);
    expect(timeline.startOf.get(1)).toBe(0);
    expect(timeline.startOf.get(2)!).toBeLessThan(timeline.startOf.get(3)!);
  });

  it("按排名映射：隔了一年的空窗期不会变成一大段空白", () => {
    // 前三张挨着，第四张隔了一年
    const timeline = buildTimeline([
      node(1, 0),
      node(2, DAY),
      node(3, 2 * DAY),
      node(4, 367 * DAY),
    ]);
    const starts = timeline.order.map(id => timeline.startOf.get(id)!);
    const gaps = starts.slice(1).map((s, i) => s - starts[i]);
    // 相邻两张的出现间隔都一样
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]);
  });

  it("同一时刻创建（批量导入）的卡片一起出现", () => {
    const timeline = buildTimeline([node(1, 0), node(2, DAY), node(3, DAY), node(4, 2 * DAY)]);
    expect(timeline.startOf.get(2)).toBe(timeline.startOf.get(3));
  });

  it("进度 0 时什么都没有，进度 1 时全部长满", () => {
    const timeline = buildTimeline([node(1, 0), node(2, DAY), node(3, 2 * DAY)]);
    const start = revealAt(timeline, 0);
    expect([...start.values()].every(v => v === 0)).toBe(true);
    expect(start.size).toBe(3);
    expect(revealAt(timeline, 1).size).toBe(0);
    expect(shownCount(timeline, 0)).toBe(0);
    expect(shownCount(timeline, 1)).toBe(3);
  });

  it("最后一张在进度走到 1 前正好长满（不会在结束时还是半个点）", () => {
    const timeline = buildTimeline(Array.from({ length: 50 }, (_, i) => node(i, i * DAY)));
    const nearEnd = revealAt(timeline, 0.999);
    expect([...nearEnd.values()].every(v => v > 0.9)).toBe(true);
  });

  it("进度对应的日期按排名反查，是真实的创建日期", () => {
    const timeline = buildTimeline([node(1, 5 * DAY), node(2, 400 * DAY)]);
    expect(timeAt(timeline, 0)).toBe(5 * DAY);
    expect(timeAt(timeline, 1)).toBe(400 * DAY);
  });

  it("时长随卡片数按对数增长并封顶：2 万张也不会播半小时", () => {
    expect(baseDuration(50)).toBeLessThan(baseDuration(700));
    expect(baseDuration(700)).toBeLessThan(baseDuration(20_000));
    expect(baseDuration(20_000)).toBeLessThanOrEqual(20_000);
    expect(baseDuration(700)).toBeGreaterThan(8000);
    expect(baseDuration(700)).toBeLessThan(14_000);
  });

  it("弹簧曲线从 0 到 1，中途冲过头再回落", () => {
    expect(springScale(0)).toBe(0);
    expect(springScale(1)).toBe(1);
    const samples = Array.from({ length: 50 }, (_, i) => springScale(i / 50));
    expect(Math.max(...samples)).toBeGreaterThan(1);
  });
});
