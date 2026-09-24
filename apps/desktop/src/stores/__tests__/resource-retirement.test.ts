import { afterEach, describe, expect, it } from "vitest";
import useTabStore from "../useTabStore";
import useNavigationHistoryStore from "../useNavigationHistoryStore";
import { useSearchStore } from "@/features/search/searchStore";
import { TabType } from "@/types/tab";

afterEach(() => localStorage.clear());

describe("退役模块历史状态恢复", () => {
  it.each(["resourceManagement", "feed", "rssSubscription", "readLater"])(
    "恢复旧标签时移除 %s，修复活动标签和空分组",
    async type => {
      localStorage.setItem(
        "tab-store",
        JSON.stringify({
          version: 7,
          state: {
            panes: [
              {
                id: "pane",
                tabs: [
                  { id: "removed", type, groupId: "empty" },
                  { id: "keep", type: TabType.Settings, title: "设置" },
                ],
                activeTabId: "removed",
                groups: [{ id: "empty" }],
              },
            ],
            activePaneId: "pane",
            sidebarCollapsed: true,
          },
        })
      );
      await useTabStore.persist.rehydrate();
      const state = useTabStore.getState();
      expect(state.panes[0].tabs.map(tab => tab.id)).toEqual(["keep"]);
      expect(state.panes[0].activeTabId).toBe("keep");
      expect(state.panes[0].groups).toEqual([]);
      expect(state.sidebarCollapsed).toBe(true);
    }
  );

  it.each(["resourceManagement", "feed", "rssSubscription", "readLater"])(
    "仅有 %s 的旧面板恢复为首页",
    async type => {
      localStorage.setItem(
        "tab-store",
        JSON.stringify({
          version: 7,
          state: {
            panes: [
              {
                id: "pane",
                tabs: [{ id: "removed", type }],
                activeTabId: "removed",
              },
            ],
          },
        })
      );
      await useTabStore.persist.rehydrate();
      const pane = useTabStore.getState().panes[0];
      expect(pane.tabs).toHaveLength(1);
      expect(pane.tabs[0].type).toBe(TabType.Home);
      expect(pane.activeTabId).toBe(pane.tabs[0].id);
    }
  );

  it.each(["resources", "feed", "rssSubscription", "readLater"])(
    "新旧搜索历史移除 %s 并保留其他访问记录",
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
      localStorage.setItem(
        "navigation-history-store",
        JSON.stringify({
          version: 4,
          state: {
            history: [
              { type: type === "resources" ? "resourceManagement" : type },
              { type: TabType.Settings, title: "设置", count: 2 },
            ],
          },
        })
      );
      await useSearchStore.persist.rehydrate();
      await useNavigationHistoryStore.persist.rehydrate();
      expect(useSearchStore.getState().visits).toEqual([visit]);
      expect(useNavigationHistoryStore.getState().history).toEqual([
        { type: TabType.Settings, title: "设置", count: 2 },
      ]);
    }
  );
});
