import { afterEach, describe, expect, it } from "vitest";
import useTabStore from "../useTabStore";
import useNavigationHistoryStore from "../useNavigationHistoryStore";
import { useSearchStore } from "@/features/search/searchStore";
import { TabType } from "@/types/tab";

afterEach(() => localStorage.clear());

describe("资源管理历史状态退役", () => {
  it("恢复旧标签时移除资源页，修复活动标签和空分组，保留其他页", async () => {
    localStorage.setItem(
      "tab-store",
      JSON.stringify({
        version: 6,
        state: {
          panes: [
            {
              id: "pane",
              tabs: [
                { id: "removed", type: "resourceManagement", groupId: "empty" },
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
  });

  it("仅有资源页的旧面板恢复为有效默认页", async () => {
    localStorage.setItem(
      "tab-store",
      JSON.stringify({
        version: 6,
        state: {
          panes: [
            {
              id: "pane",
              tabs: [{ id: "removed", type: "resourceManagement" }],
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
  });

  it("新旧命令面板历史均移除资源页且保留其他访问记录", async () => {
    const visit = { key: "home", ts: 10, count: 3 };
    localStorage.setItem(
      "tau-search-history",
      JSON.stringify({
        version: 0,
        state: {
          visits: [visit, { key: "resources", ts: 11, count: 4 }],
        },
      })
    );
    localStorage.setItem(
      "navigation-history-store",
      JSON.stringify({
        version: 3,
        state: {
          history: [
            { type: "resourceManagement" },
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
  });
});
