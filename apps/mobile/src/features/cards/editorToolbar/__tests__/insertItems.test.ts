import { afterEach, describe, expect, it } from "vitest";

import {
  INSERT_GROUPS,
  INSERT_ITEMS,
  RECENT_INSERT_LIMIT,
  RECENT_INSERT_STORAGE_KEY,
  pushRecentInsertKind,
  readRecentInsertKinds,
  searchInsertItems,
} from "../insertItems";

const kindsOf = (items: { kind: string }[]) => items.map(item => item.kind);

describe("insertItems", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("条目 kind 唯一且分组均已声明", () => {
    const kinds = kindsOf(INSERT_ITEMS);
    expect(new Set(kinds).size).toBe(kinds.length);
    const groupKeys = new Set(INSERT_GROUPS.map(group => group.key));
    for (const item of INSERT_ITEMS) {
      expect(groupKeys.has(item.group), item.kind).toBe(true);
    }
    expect(groupKeys.has("plugin")).toBe(true);
    expect(INSERT_ITEMS.some(item => item.group === "plugin")).toBe(false);
  });

  it("空查询返回全部条目", () => {
    expect(searchInsertItems(INSERT_ITEMS, "")).toEqual(INSERT_ITEMS);
    expect(searchInsertItems(INSERT_ITEMS, "  ")).toEqual(INSERT_ITEMS);
  });

  it("按 label、拼音首字母、英文匹配，大小写不敏感", () => {
    expect(kindsOf(searchInsertItems(INSERT_ITEMS, "表格"))).toEqual(["table"]);
    expect(kindsOf(searchInsertItems(INSERT_ITEMS, "bg"))).toEqual(["table"]);
    expect(kindsOf(searchInsertItems(INSERT_ITEMS, "TABLE"))).toEqual(["table"]);
    expect(kindsOf(searchInsertItems(INSERT_ITEMS, "biao"))).toContain("table");
  });

  it("多条命中时保持原顺序", () => {
    const result = kindsOf(searchInsertItems(INSERT_ITEMS, "网络"));
    expect(result).toEqual(["image-url", "video-url", "audio-url"]);
    const all = kindsOf(INSERT_ITEMS);
    const videoMatches = kindsOf(searchInsertItems(INSERT_ITEMS, "video"));
    expect(videoMatches).toEqual(all.filter(kind => videoMatches.includes(kind)));
  });

  it("无匹配返回空数组", () => {
    expect(searchInsertItems(INSERT_ITEMS, "不存在的块")).toEqual([]);
  });

  it("最近使用：去重、最新在前、最多 4 个", () => {
    expect(readRecentInsertKinds()).toEqual([]);
    pushRecentInsertKind("table");
    pushRecentInsertKind("math");
    expect(pushRecentInsertKind("table")).toEqual(["table", "math"]);
    pushRecentInsertKind("camera");
    pushRecentInsertKind("divider");
    pushRecentInsertKind("callout");
    const recent = readRecentInsertKinds();
    expect(recent).toEqual(["callout", "divider", "camera", "table"]);
    expect(recent).toHaveLength(RECENT_INSERT_LIMIT);
  });

  it("最近使用：忽略损坏的存储与非法值", () => {
    localStorage.setItem(RECENT_INSERT_STORAGE_KEY, "{bad json");
    expect(readRecentInsertKinds()).toEqual([]);
    localStorage.setItem(RECENT_INSERT_STORAGE_KEY, JSON.stringify({ kind: "table" }));
    expect(readRecentInsertKinds()).toEqual([]);
    localStorage.setItem(
      RECENT_INSERT_STORAGE_KEY,
      JSON.stringify(["table", 1, "unknown", "table", null, "math"])
    );
    expect(readRecentInsertKinds()).toEqual(["table", "math"]);
  });
});
