import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatOpenedAt,
  projectTimeMeta,
  recentProjects,
  sortProjects,
  type ProjectListItem,
} from "../model";

const NOW = new Date(2026, 9, 1, 18, 0).getTime();
const DAY = 86_400_000;

function item(id: number, patch: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id,
    title: `项目 ${id}`,
    desc: [],
    children: [],
    archived: false,
    pinned: false,
    createTime: NOW - 100 * DAY,
    updateTime: NOW - 10 * DAY,
    itemCount: 0,
    metric: 0,
    openedAt: null,
    lastItemId: null,
    lastItemTitle: null,
    ...patch,
  };
}

const ids = (list: ProjectListItem[]) => list.map(p => p.id);

describe("sortProjects", () => {
  it("置顶在任何排序下都排最前", () => {
    const list = [item(1, { openedAt: NOW }), item(2, { pinned: true }), item(3, { title: "A" })];
    expect(ids(sortProjects(list, "opened"))[0]).toBe(2);
    expect(ids(sortProjects(list, "name"))[0]).toBe(2);
  });

  it("按最近打开：打开过的在前，没打开过的按更新时间", () => {
    const list = [
      item(1, { updateTime: NOW - DAY }),
      item(2, { openedAt: NOW - 3 * DAY }),
      item(3, { openedAt: NOW - DAY }),
      item(4, { updateTime: NOW }),
    ];
    expect(ids(sortProjects(list, "opened"))).toEqual([3, 2, 4, 1]);
  });

  it("按名称用拼音 + 数字自然序，按创建时间新的在前", () => {
    const list = [
      item(1, { title: "项目 10", createTime: 3 }),
      item(2, { title: "项目 2", createTime: 1 }),
      item(3, { title: "笔记", createTime: 2 }),
    ];
    expect(ids(sortProjects(list, "name"))).toEqual([3, 2, 1]);
    expect(ids(sortProjects(list, "created"))).toEqual([1, 3, 2]);
  });
});

describe("recentProjects", () => {
  it("只取打开过的，按打开时间取前 3 个，不受置顶影响", () => {
    const list = [
      item(1, { openedAt: NOW - 4 * DAY }),
      item(2, { openedAt: NOW - DAY, pinned: true }),
      item(3),
      item(4, { openedAt: NOW }),
      item(5, { openedAt: NOW - 2 * DAY }),
    ];
    expect(ids(recentProjects(list))).toEqual([4, 2, 5]);
  });
});

describe("时间展示", () => {
  it("今天 / 昨天带时刻，更早用相对时间", () => {
    expect(formatOpenedAt(new Date(2026, 9, 1, 9, 5).getTime(), NOW)).toBe("今天 09:05");
    expect(formatOpenedAt(new Date(2026, 8, 30, 21, 45).getTime(), NOW)).toBe("昨天 21:45");
    expect(formatOpenedAt(NOW - 3 * DAY, NOW)).toBe("3 天前");
  });

  it("日期今年省略年份", () => {
    expect(formatDate(new Date(2026, 2, 2).getTime(), NOW)).toBe("3月2日");
    expect(formatDate(new Date(2025, 10, 3).getTime(), NOW)).toBe("2025年11月3日");
  });

  it("网格时间位跟随排序，没打开过的回落到更新时间", () => {
    const opened = item(1, { openedAt: NOW - DAY });
    const never = item(2, { updateTime: NOW - 3 * DAY });
    expect(projectTimeMeta(opened, "opened", NOW)).toBe("昨天打开");
    expect(projectTimeMeta(never, "opened", NOW)).toBe("3 天前更新");
    expect(projectTimeMeta(opened, "updated", NOW)).toBe("1 周前更新");
    expect(projectTimeMeta(opened, "created", NOW)).toBe("创建于 6月23日");
  });
});
