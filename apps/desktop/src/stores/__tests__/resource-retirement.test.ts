import { afterEach, describe, expect, it } from "vitest";
import { useSearchStore } from "@/features/search/searchStore";

afterEach(() => localStorage.clear());

describe("退役模块历史状态恢复", () => {
  it.each(["resources", "feed", "rssSubscription", "readLater"])(
    "搜索历史移除 %s 并保留其他访问记录",
    async type => {
      const visit = { key: "home", ts: 10, count: 3 };
      localStorage.setItem(
        "tau-search-history",
        JSON.stringify({
          version: 2,
          state: {
            visits: [visit, { key: type, ts: 11, count: 4 }],
          },
        })
      );
      await useSearchStore.persist.rehydrate();
      expect(useSearchStore.getState().visits).toEqual([visit]);
    }
  );
});
