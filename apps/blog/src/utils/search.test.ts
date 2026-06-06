import { afterEach, describe, expect, it } from "vitest";

import {
  clearRecentSearchQueries,
  readRecentSearchQueries,
  saveRecentSearchQuery,
  SEARCH_RECENT_QUERIES_KEY,
} from "./search";

describe("blog/search recent queries", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("应写入最近搜索并去重置顶", () => {
    saveRecentSearchQuery("  发布   索引  ");
    saveRecentSearchQuery("Fuse");
    saveRecentSearchQuery("发布 索引");

    expect(readRecentSearchQueries()).toEqual(["发布 索引", "Fuse"]);
    expect(
      JSON.parse(window.localStorage.getItem(SEARCH_RECENT_QUERIES_KEY)!),
    ).toEqual(["发布 索引", "Fuse"]);
  });

  it("最近搜索最多保留 5 条", () => {
    ["一", "二", "三", "四", "五", "六"].forEach(saveRecentSearchQuery);

    expect(readRecentSearchQueries()).toEqual(["六", "五", "四", "三", "二"]);
  });

  it("应支持清空最近搜索", () => {
    saveRecentSearchQuery("项目文档");

    clearRecentSearchQueries();

    expect(readRecentSearchQueries()).toEqual([]);
    expect(window.localStorage.getItem(SEARCH_RECENT_QUERIES_KEY)).toBeNull();
  });
});
