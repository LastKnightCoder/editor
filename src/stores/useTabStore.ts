import { create } from "zustand";
import { persist } from "zustand/middleware";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import type { ProjectColorName } from "@/constants/project-colors";
import {
  ITab,
  IPane,
  ITabGroup,
  TabType,
  TabParams,
  TAB_TITLES,
  PaneDirection,
} from "@/types/tab";

interface IState {
  panes: IPane[];
  activePaneId: string;
  sidebarCollapsed: boolean;
}

interface IActions {
  // Pane 操作
  createPane: (
    direction?: PaneDirection,
    splitRatio?: number,
    createDefaultTab?: boolean,
  ) => string;
  createPaneWithTab: (
    fromPaneId: string,
    tabId: string,
    direction?: PaneDirection,
    splitRatio?: number,
  ) => string;
  createPaneWithTabGroup: (
    fromPaneId: string,
    groupId: string,
    direction?: PaneDirection,
    splitRatio?: number,
  ) => string;
  moveTabGroupToPane: (
    fromPaneId: string,
    toPaneId: string,
    groupId: string,
  ) => void;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  updatePaneSplitRatio: (paneId: string, ratio: number) => void;

  // Tab 操作
  createTab: <T extends TabType>(
    type: T,
    params?: TabParams[T],
    paneId?: string,
    title?: string,
  ) => string;
  closeTab: (paneId: string, tabId: string) => void;
  switchTab: (paneId: string, tabId: string) => void;
  updateTab: <T extends TabType>(
    paneId: string,
    tabId: string,
    updates: Partial<ITab<T>>,
  ) => void;
  reorderTab: (paneId: string, fromIndex: number, toIndex: number) => void;
  moveTabToPane: (
    fromPaneId: string,
    toPaneId: string,
    tabId: string,
    toIndex?: number,
  ) => void;
  moveTabToPaneAndSetGroup: (
    fromPaneId: string,
    toPaneId: string,
    tabId: string,
    groupId: string,
  ) => void;

  // Tab 分组操作
  createTabGroup: (
    paneId: string,
    payload?: { title?: string; color?: ProjectColorName; tabId?: string },
  ) => string;
  updateTabGroup: (
    paneId: string,
    groupId: string,
    updates: Partial<ITabGroup>,
  ) => void;
  removeTabGroup: (paneId: string, groupId: string) => void;
  setTabGroup: (paneId: string, tabId: string, groupId?: string) => void;
  reorderTabGroup: (
    paneId: string,
    groupId: string,
    targetGroupId: string,
    position: "before" | "after",
  ) => void;
  moveTabGroupToTab: (
    paneId: string,
    groupId: string,
    targetTabId: string,
    position: "before" | "after",
  ) => void;

  // 导航操作
  navigateTo: <T extends TabType>(
    type: T,
    params?: TabParams[T],
    title?: string,
  ) => void;
  openInNewTab: <T extends TabType>(
    type: T,
    params?: TabParams[T],
    paneId?: string,
    title?: string,
  ) => void;
  openInSplit: <T extends TabType>(
    type: T,
    params?: TabParams[T],
    direction?: PaneDirection,
    title?: string,
  ) => void;

  // Sidebar 操作
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // 工具方法
  getActivePane: () => IPane | undefined;
  getActiveTab: () => ITab | undefined;
  findTab: (
    type: TabType,
    params?: unknown,
  ) => { paneId: string; tab: ITab } | null;
}

const createInitialPane = (): IPane => {
  const homeTabId = uuidv4();
  return {
    id: uuidv4(),
    tabs: [
      {
        id: homeTabId,
        type: TabType.Home,
        title: TAB_TITLES[TabType.Home],
        closable: false,
      },
    ],
    activeTabId: homeTabId,
    groups: [],
  };
};

const initialState: IState = {
  panes: [createInitialPane()],
  activePaneId: "",
  sidebarCollapsed: false,
};

initialState.activePaneId = initialState.panes[0].id;

const useTabStore = create<IState & IActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Pane 操作
      createPane: (
        direction = PaneDirection.Horizontal,
        splitRatio = 0.5,
        createDefaultTab = true,
      ) => {
        const paneId = uuidv4();
        const homeTabId = uuidv4();
        const newPane: IPane = {
          id: paneId,
          tabs: createDefaultTab
            ? [
                {
                  id: homeTabId,
                  type: TabType.Home,
                  title: TAB_TITLES[TabType.Home],
                  closable: false,
                },
              ]
            : [],
          activeTabId: createDefaultTab ? homeTabId : "",
          direction,
          splitRatio,
          groups: [],
        };

        console.log("[createPane] Creating new pane:", {
          paneId,
          direction,
          createDefaultTab,
          tabsCount: newPane.tabs.length,
        });

        set(
          produce((state: IState) => {
            state.panes.push(newPane);
            state.activePaneId = paneId;
            console.log(
              "[createPane] Total panes after creation:",
              state.panes.length,
            );
          }),
        );
        return paneId;
      },

      createPaneWithTab: (
        fromPaneId: string,
        tabId: string,
        direction = PaneDirection.Horizontal,
        splitRatio = 0.5,
      ) => {
        const newPaneId = uuidv4();

        console.log("[createPaneWithTab] Starting:", {
          fromPaneId,
          tabId,
          newPaneId,
          direction,
        });

        set(
          produce((state: IState) => {
            const fromPane = state.panes.find((p) => p.id === fromPaneId);
            if (!fromPane) {
              console.log("[createPaneWithTab] Source pane not found");
              return;
            }

            const tabIndex = fromPane.tabs.findIndex((t) => t.id === tabId);
            if (tabIndex === -1) {
              console.log("[createPaneWithTab] Tab not found in source pane");
              return;
            }

            // 从源 pane 移除 tab
            const [tab] = fromPane.tabs.splice(tabIndex, 1);
            console.log(
              "[createPaneWithTab] Removed tab from source:",
              tab.title,
            );

            if (fromPane.groups && fromPane.groups.length > 0) {
              fromPane.groups = fromPane.groups.filter((group) =>
                fromPane.tabs.some((t) => t.groupId === group.id),
              );
            }

            // 创建新 pane 并添加 tab
            const newPane: IPane = {
              id: newPaneId,
              tabs: [tab],
              activeTabId: tabId,
              direction,
              splitRatio,
              groups: [],
            };

            state.panes.push(newPane);
            state.activePaneId = newPaneId;

            console.log("[createPaneWithTab] Created new pane with tab");
            console.log(
              "[createPaneWithTab] Total panes before cleanup:",
              state.panes.length,
            );

            // 如果源 pane 的当前激活 tab 被移动了，切换到相邻的 tab
            if (fromPane.activeTabId === tabId && fromPane.tabs.length > 0) {
              const newIndex = Math.min(tabIndex, fromPane.tabs.length - 1);
              fromPane.activeTabId = fromPane.tabs[newIndex].id;
            }

            // 如果源 pane 没有 tabs 了，删除该 pane
            if (fromPane.tabs.length === 0) {
              const paneIndex = state.panes.findIndex(
                (p) => p.id === fromPaneId,
              );
              if (paneIndex !== -1) {
                state.panes.splice(paneIndex, 1);
                console.log("[createPaneWithTab] Removed empty source pane");
              }
            }

            // 限制最多 2 个 pane，删除最旧的 pane（保留最后 2 个）
            if (state.panes.length > 2) {
              console.log(
                "[createPaneWithTab] Too many panes, removing oldest",
              );
              state.panes.shift(); // 删除第一个（最旧的）pane
            }

            console.log(
              "[createPaneWithTab] Final panes count:",
              state.panes.length,
            );
          }),
        );

        return newPaneId;
      },

      createPaneWithTabGroup: (
        fromPaneId: string,
        groupId: string,
        direction = PaneDirection.Horizontal,
        splitRatio = 0.5,
      ) => {
        const newPaneId = uuidv4();

        console.log("[createPaneWithTabGroup] Starting:", {
          fromPaneId,
          groupId,
          newPaneId,
          direction,
        });

        set(
          produce((state: IState) => {
            const fromPane = state.panes.find((p) => p.id === fromPaneId);
            if (!fromPane) {
              console.log("[createPaneWithTabGroup] Source pane not found");
              return;
            }

            // 找到该分组的定义
            const group = fromPane.groups?.find((g) => g.id === groupId);
            if (!group) {
              console.log("[createPaneWithTabGroup] Group not found");
              return;
            }

            // 找到该分组下的所有 tabs
            const groupTabs = fromPane.tabs.filter(
              (t) => t.groupId === groupId,
            );
            if (groupTabs.length === 0) {
              console.log("[createPaneWithTabGroup] No tabs in group");
              return;
            }

            // 从源 pane 移除这些 tabs
            fromPane.tabs = fromPane.tabs.filter((t) => t.groupId !== groupId);

            // 从源 pane 移除分组定义
            if (fromPane.groups) {
              fromPane.groups = fromPane.groups.filter((g) => g.id !== groupId);
            }

            // 创建新 pane 并添加分组和 tabs
            const newPane: IPane = {
              id: newPaneId,
              tabs: groupTabs,
              activeTabId: groupTabs[0].id,
              direction,
              splitRatio,
              groups: [{ ...group }],
            };

            state.panes.push(newPane);
            state.activePaneId = newPaneId;

            console.log("[createPaneWithTabGroup] Created new pane with group");

            // 如果源 pane 的激活 tab 在移动的分组中，切换到其他 tab
            if (
              groupTabs.some((t) => t.id === fromPane.activeTabId) &&
              fromPane.tabs.length > 0
            ) {
              fromPane.activeTabId = fromPane.tabs[0].id;
            }

            // 如果源 pane 没有 tabs 了，删除该 pane
            if (fromPane.tabs.length === 0) {
              const paneIndex = state.panes.findIndex(
                (p) => p.id === fromPaneId,
              );
              if (paneIndex !== -1) {
                state.panes.splice(paneIndex, 1);
                console.log(
                  "[createPaneWithTabGroup] Removed empty source pane",
                );
              }
            }

            // 限制最多 2 个 pane，删除最旧的 pane（保留最后 2 个）
            if (state.panes.length > 2) {
              console.log(
                "[createPaneWithTabGroup] Too many panes, removing oldest",
              );
              state.panes.shift();
            }

            console.log(
              "[createPaneWithTabGroup] Final panes count:",
              state.panes.length,
            );
          }),
        );

        return newPaneId;
      },

      moveTabGroupToPane: (
        fromPaneId: string,
        toPaneId: string,
        groupId: string,
      ) => {
        console.log("[moveTabGroupToPane] Starting:", {
          fromPaneId,
          toPaneId,
          groupId,
        });

        set(
          produce((state: IState) => {
            const fromPane = state.panes.find((p) => p.id === fromPaneId);
            const toPane = state.panes.find((p) => p.id === toPaneId);

            if (!fromPane || !toPane) {
              console.log("[moveTabGroupToPane] Pane not found");
              return;
            }

            // 找到该分组的定义
            const group = fromPane.groups?.find((g) => g.id === groupId);
            if (!group) {
              console.log("[moveTabGroupToPane] Group not found");
              return;
            }

            // 找到该分组下的所有 tabs
            const groupTabs = fromPane.tabs.filter(
              (t) => t.groupId === groupId,
            );
            if (groupTabs.length === 0) {
              console.log("[moveTabGroupToPane] No tabs in group");
              return;
            }

            // 从源 pane 移除这些 tabs
            fromPane.tabs = fromPane.tabs.filter((t) => t.groupId !== groupId);

            // 从源 pane 移除分组定义
            if (fromPane.groups) {
              fromPane.groups = fromPane.groups.filter((g) => g.id !== groupId);
            }

            // 添加到目标 pane
            toPane.tabs.push(...groupTabs);
            if (!toPane.groups) {
              toPane.groups = [];
            }
            toPane.groups.push({ ...group });
            toPane.activeTabId = groupTabs[0].id;

            // 如果源 pane 的激活 tab 在移动的分组中，切换到其他 tab
            if (
              groupTabs.some((t) => t.id === fromPane.activeTabId) &&
              fromPane.tabs.length > 0
            ) {
              fromPane.activeTabId = fromPane.tabs[0].id;
            }

            // 如果源 pane 没有 tabs 了，删除该 pane（除非只剩一个 pane）
            if (fromPane.tabs.length === 0 && state.panes.length > 1) {
              const paneIndex = state.panes.findIndex(
                (p) => p.id === fromPaneId,
              );
              state.panes.splice(paneIndex, 1);
              if (state.activePaneId === fromPaneId) {
                state.activePaneId = toPaneId;
              }
            }

            // 设置目标 pane 为激活状态
            state.activePaneId = toPaneId;

            console.log("[moveTabGroupToPane] Completed");
          }),
        );
      },

      closePane: (paneId: string) => {
        set(
          produce((state: IState) => {
            const index = state.panes.findIndex((p) => p.id === paneId);
            if (index === -1 || state.panes.length === 1) return;

            state.panes.splice(index, 1);
            if (state.activePaneId === paneId) {
              state.activePaneId = state.panes[0].id;
            }
          }),
        );
      },

      setActivePane: (paneId: string) => {
        set({ activePaneId: paneId });
      },

      updatePaneSplitRatio: (paneId: string, ratio: number) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (pane) {
              pane.splitRatio = ratio;
            }
          }),
        );
      },

      // Tab 操作
      createTab: <T extends TabType>(
        type: T,
        params?: TabParams[T],
        paneId?: string,
        title?: string,
      ): string => {
        const tabId = uuidv4();
        const targetPaneId = paneId || get().activePaneId;
        const tabTitle = title || TAB_TITLES[type];

        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === targetPaneId);
            if (pane) {
              pane.tabs.push({
                id: tabId,
                type,
                title: tabTitle,
                params,
                closable: true,
              });
              pane.activeTabId = tabId;
            }
          }),
        );
        return tabId;
      },

      closeTab: (paneId: string, tabId: string) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane) return;

            const tabIndex = pane.tabs.findIndex((t) => t.id === tabId);
            if (tabIndex === -1) return;

            const tab = pane.tabs[tabIndex];
            if (tab.closable === false) return;

            pane.tabs.splice(tabIndex, 1);

            if (pane.groups && pane.groups.length > 0) {
              pane.groups = pane.groups.filter((group) =>
                pane.tabs.some((t) => t.groupId === group.id),
              );
            }

            // 如果关闭的是当前激活的 Tab，切换到相邻的 Tab
            if (pane.activeTabId === tabId) {
              if (pane.tabs.length > 0) {
                const newIndex = Math.min(tabIndex, pane.tabs.length - 1);
                pane.activeTabId = pane.tabs[newIndex].id;
              }
            }

            // 如果 pane 没有 tabs 了，关闭 pane（除非只剩一个 pane）
            if (pane.tabs.length === 0 && state.panes.length > 1) {
              const paneIndex = state.panes.findIndex((p) => p.id === paneId);
              state.panes.splice(paneIndex, 1);
              if (state.activePaneId === paneId) {
                state.activePaneId = state.panes[0].id;
              }
            }
          }),
        );
      },

      switchTab: (paneId: string, tabId: string) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (pane) {
              pane.activeTabId = tabId;
              state.activePaneId = paneId;
            }
          }),
        );
      },

      updateTab: <T extends TabType>(
        paneId: string,
        tabId: string,
        updates: Partial<ITab<T>>,
      ) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (pane) {
              const tab = pane.tabs.find((t) => t.id === tabId);
              if (tab) {
                Object.assign(tab, updates);
              }
            }
          }),
        );
      },

      reorderTab: (paneId: string, fromIndex: number, toIndex: number) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane) return;

            const [removed] = pane.tabs.splice(fromIndex, 1);
            pane.tabs.splice(toIndex, 0, removed);
          }),
        );
      },

      moveTabToPane: (
        fromPaneId: string,
        toPaneId: string,
        tabId: string,
        toIndex?: number,
      ) => {
        console.log("[moveTabToPane] Start:", {
          fromPaneId,
          toPaneId,
          tabId,
          toIndex,
        });

        set(
          produce((state: IState) => {
            const fromPane = state.panes.find((p) => p.id === fromPaneId);
            const toPane = state.panes.find((p) => p.id === toPaneId);

            console.log("[moveTabToPane] Panes found:", {
              fromPane: fromPane
                ? `Found (${fromPane.tabs.length} tabs)`
                : "Not found",
              toPane: toPane
                ? `Found (${toPane.tabs.length} tabs)`
                : "Not found",
            });

            if (!fromPane || !toPane) return;

            const tabIndex = fromPane.tabs.findIndex((t) => t.id === tabId);

            console.log("[moveTabToPane] Tab index:", tabIndex);

            if (tabIndex === -1) return;

            const [tab] = fromPane.tabs.splice(tabIndex, 1);

            console.log("[moveTabToPane] Removed tab:", tab.title);

            // 清除 tab 的 groupId，因为跨 pane 移动时旧的分组不再有效
            tab.groupId = undefined;

            if (fromPane.groups && fromPane.groups.length > 0) {
              fromPane.groups = fromPane.groups.filter((group) =>
                fromPane.tabs.some((t) => t.groupId === group.id),
              );
            }

            // 插入到目标 pane
            const insertIndex =
              toIndex !== undefined ? toIndex : toPane.tabs.length;
            toPane.tabs.splice(insertIndex, 0, tab);
            toPane.activeTabId = tabId;

            console.log(
              "[moveTabToPane] Tab moved to pane, new activeTabId:",
              tabId,
            );

            // 如果源 pane 的当前激活 tab 被移动了，切换到相邻的 tab
            if (fromPane.activeTabId === tabId && fromPane.tabs.length > 0) {
              const newIndex = Math.min(tabIndex, fromPane.tabs.length - 1);
              fromPane.activeTabId = fromPane.tabs[newIndex].id;
            }

            // 如果源 pane 没有 tabs 了，关闭该 pane（除非只剩一个 pane）
            if (fromPane.tabs.length === 0 && state.panes.length > 1) {
              const paneIndex = state.panes.findIndex(
                (p) => p.id === fromPaneId,
              );
              state.panes.splice(paneIndex, 1);
              if (state.activePaneId === fromPaneId) {
                state.activePaneId = toPaneId;
              }
            }

            // 设置目标 pane 为激活状态
            state.activePaneId = toPaneId;
          }),
        );
      },

      moveTabToPaneAndSetGroup: (
        fromPaneId: string,
        toPaneId: string,
        tabId: string,
        groupId: string,
      ) => {
        console.log("[moveTabToPaneAndSetGroup] Start:", {
          fromPaneId,
          toPaneId,
          tabId,
          groupId,
        });

        set(
          produce((state: IState) => {
            const fromPane = state.panes.find((p) => p.id === fromPaneId);
            const toPane = state.panes.find((p) => p.id === toPaneId);

            if (!fromPane || !toPane) {
              console.log("[moveTabToPaneAndSetGroup] Pane not found");
              return;
            }

            const tabIndex = fromPane.tabs.findIndex((t) => t.id === tabId);
            if (tabIndex === -1) {
              console.log(
                "[moveTabToPaneAndSetGroup] Tab not found in fromPane",
              );
              return;
            }

            // 从源 pane 移除 tab
            const [tab] = fromPane.tabs.splice(tabIndex, 1);
            console.log("[moveTabToPaneAndSetGroup] Removed tab:", tab.title);

            // 清理源 pane 的空分组
            if (fromPane.groups && fromPane.groups.length > 0) {
              fromPane.groups = fromPane.groups.filter((group) =>
                fromPane.tabs.some((t) => t.groupId === group.id),
              );
            }

            // 设置 tab 的 groupId
            tab.groupId = groupId;

            // 找到目标分组在目标 pane 中最后一个 tab 的位置
            const groupTabIndices: number[] = [];
            toPane.tabs.forEach((t, index) => {
              if (t.groupId === groupId) {
                groupTabIndices.push(index);
              }
            });

            // 插入到目标分组的末尾
            let insertIndex = toPane.tabs.length;
            if (groupTabIndices.length > 0) {
              insertIndex = groupTabIndices[groupTabIndices.length - 1] + 1;
            }

            toPane.tabs.splice(insertIndex, 0, tab);
            toPane.activeTabId = tabId;

            console.log("[moveTabToPaneAndSetGroup] Tab moved and grouped:", {
              insertIndex,
              newTabsLength: toPane.tabs.length,
            });

            // 如果源 pane 的当前激活 tab 被移动了，切换到相邻的 tab
            if (fromPane.activeTabId === tabId && fromPane.tabs.length > 0) {
              const newIndex = Math.min(tabIndex, fromPane.tabs.length - 1);
              fromPane.activeTabId = fromPane.tabs[newIndex].id;
            }

            // 如果源 pane 没有 tabs 了，关闭该 pane（除非只剩一个 pane）
            if (fromPane.tabs.length === 0 && state.panes.length > 1) {
              const paneIndex = state.panes.findIndex(
                (p) => p.id === fromPaneId,
              );
              state.panes.splice(paneIndex, 1);
              if (state.activePaneId === fromPaneId) {
                state.activePaneId = toPaneId;
              }
            }

            // 设置目标 pane 为激活状态
            state.activePaneId = toPaneId;

            console.log("[moveTabToPaneAndSetGroup] Completed");
          }),
        );
      },

      // Tab 分组操作
      createTabGroup: (
        paneId: string,
        payload?: { title?: string; color?: ProjectColorName; tabId?: string },
      ) => {
        const groupId = uuidv4();

        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane) return;

            if (!pane.groups) {
              pane.groups = [];
            }

            const group: ITabGroup = {
              id: groupId,
              title: payload?.title || `分组 ${pane.groups.length + 1}`,
              color: payload?.color,
              collapsed: false,
            };

            pane.groups.push(group);

            if (payload?.tabId) {
              const tab = pane.tabs.find((t) => t.id === payload.tabId);
              if (tab) {
                tab.groupId = groupId;
              }
            }
          }),
        );

        return groupId;
      },

      updateTabGroup: (
        paneId: string,
        groupId: string,
        updates: Partial<ITabGroup>,
      ) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane || !pane.groups) return;

            const group = pane.groups.find((g) => g.id === groupId);
            if (!group) return;

            Object.assign(group, updates);
          }),
        );
      },

      removeTabGroup: (paneId: string, groupId: string) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane || !pane.groups) return;

            // 先将该分组下的所有 Tab 取消分组
            pane.tabs.forEach((tab) => {
              if (tab.groupId === groupId) {
                tab.groupId = undefined;
              }
            });

            const index = pane.groups.findIndex((g) => g.id === groupId);
            if (index !== -1) {
              pane.groups.splice(index, 1);
            }
          }),
        );
      },

      setTabGroup: (paneId: string, tabId: string, groupId?: string) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane) {
              console.log("[TabStore][setTabGroup] pane not found", {
                paneId,
                tabId,
                groupId: groupId ?? "none",
              });
              return;
            }

            const tabs = pane.tabs;
            const currentIndex = tabs.findIndex((t) => t.id === tabId);
            console.log("[TabStore][setTabGroup] start", {
              paneId,
              tabId,
              groupId: groupId ?? "none",
              currentIndex,
              totalTabs: tabs.length,
              tabsState: tabs.map((t) => ({
                id: t.id,
                title: t.title,
                groupId: t.groupId,
              })),
            });

            if (currentIndex === -1) {
              console.log("[TabStore][setTabGroup] tab not found", {
                paneId,
                tabId,
              });
              return;
            }

            console.log("[TabStore][setTabGroup] before", {
              tabs: tabs.map((t) => ({
                id: t.id,
                title: t.title,
                groupId: t.groupId,
              })),
            });

            const [tab] = tabs.splice(currentIndex, 1);
            tab.groupId = groupId;

            if (!groupId) {
              // 移出分组时保持大致位置，插入到当前索引位置
              const insertIndex = Math.min(currentIndex, tabs.length);
              tabs.splice(insertIndex, 0, tab);
              console.log("[TabStore][setTabGroup] after (ungroup)", {
                paneId,
                tabId,
                insertIndex,
                tabs: tabs.map((t) => ({
                  id: t.id,
                  title: t.title,
                  groupId: t.groupId,
                })),
              });
              return;
            }

            // 插入到目标分组的末尾
            const groupTabIndices: number[] = [];
            tabs.forEach((t, index) => {
              if (t.groupId === groupId) {
                groupTabIndices.push(index);
              }
            });

            let insertIndex = tabs.length;
            if (groupTabIndices.length > 0) {
              insertIndex = groupTabIndices[groupTabIndices.length - 1] + 1;
            } else {
              insertIndex = Math.min(currentIndex, tabs.length);
            }

            tabs.splice(insertIndex, 0, tab);

            console.log("[TabStore][setTabGroup] after (group)", {
              paneId,
              tabId,
              groupId,
              insertIndex,
              tabs: tabs.map((t) => ({
                id: t.id,
                title: t.title,
                groupId: t.groupId,
              })),
            });

            if (pane.groups && pane.groups.length > 0) {
              pane.groups = pane.groups.filter((group) =>
                tabs.some((t) => t.groupId === group.id),
              );

              console.log("[TabStore][setTabGroup] groups after cleanup", {
                paneId,
                groups: pane.groups.map((g) => ({ id: g.id, title: g.title })),
              });
            }
          }),
        );
      },

      moveTabGroupToTab: (
        paneId: string,
        groupId: string,
        targetTabId: string,
        position: "before" | "after",
      ) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane) return;

            const tabs = pane.tabs;
            console.log("[TabStore][moveTabGroupToTab] start", {
              paneId,
              groupId,
              targetTabId,
              position,
            });

            // 找到该分组下的所有 tabs
            const groupTabs = tabs.filter((t) => t.groupId === groupId);
            if (groupTabs.length === 0) {
              console.log("[TabStore][moveTabGroupToTab] no tabs in group");
              return;
            }

            // 找到目标 tab 的索引
            const targetIndex = tabs.findIndex((t) => t.id === targetTabId);
            if (targetIndex === -1) {
              console.log("[TabStore][moveTabGroupToTab] target tab not found");
              return;
            }

            // 移除分组中的所有 tabs
            const remainingTabs = tabs.filter((t) => t.groupId !== groupId);

            // 计算插入位置（在 remainingTabs 中）
            const targetIndexInRemaining = remainingTabs.findIndex(
              (t) => t.id === targetTabId,
            );
            const insertIndex =
              position === "before"
                ? targetIndexInRemaining
                : targetIndexInRemaining + 1;

            // 重新组装 tabs 数组
            const newTabs: ITab[] = [];
            for (let i = 0; i < remainingTabs.length; i += 1) {
              if (i === insertIndex) {
                newTabs.push(...groupTabs);
              }
              newTabs.push(remainingTabs[i]);
            }

            // 如果插入位置在末尾
            if (insertIndex >= remainingTabs.length) {
              newTabs.push(...groupTabs);
            }

            pane.tabs = newTabs;

            console.log("[TabStore][moveTabGroupToTab] completed", {
              paneId,
              tabs: pane.tabs.map((t) => ({
                id: t.id,
                title: t.title,
                groupId: t.groupId,
              })),
            });
          }),
        );
      },

      reorderTabGroup: (
        paneId: string,
        groupId: string,
        targetGroupId: string,
        position: "before" | "after",
      ) => {
        set(
          produce((state: IState) => {
            const pane = state.panes.find((p) => p.id === paneId);
            if (!pane || !pane.groups) return;

            const groups = pane.groups;
            console.log("[TabStore][reorderTabGroup] start", {
              paneId,
              groupId,
              targetGroupId,
              position,
              groups: groups.map((g) => g.id),
            });
            const fromIndex = groups.findIndex((g) => g.id === groupId);
            const toIndex = groups.findIndex((g) => g.id === targetGroupId);
            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
              console.log("[TabStore][reorderTabGroup] invalid indexes", {
                fromIndex,
                toIndex,
              });
              return;
            }

            const [moved] = groups.splice(fromIndex, 1);
            let insertIndex = position === "before" ? toIndex : toIndex + 1;
            if (insertIndex > fromIndex) {
              insertIndex -= 1;
            }
            groups.splice(insertIndex, 0, moved);

            console.log("[TabStore][reorderTabGroup] groups after", {
              paneId,
              order: groups.map((g) => g.id),
            });

            // 同时调整该分组下所有 Tab 在 tabs 数组中的位置，保证整个分组作为一个块移动
            const tabs = pane.tabs;

            const movingTabs = tabs.filter((t) => t.groupId === groupId);
            if (movingTabs.length === 0) {
              console.log("[TabStore][reorderTabGroup] no tabs for group", {
                paneId,
                groupId,
              });
              return;
            }

            const remainingTabs = tabs.filter((t) => t.groupId !== groupId);

            let targetStart = -1;
            let targetEnd = -1;
            remainingTabs.forEach((t, index) => {
              if (t.groupId === targetGroupId) {
                if (targetStart === -1) {
                  targetStart = index;
                }
                targetEnd = index;
              }
            });

            if (targetStart === -1) {
              // 理论上不应该发生（没有 Tab 的分组会被清理），兜底直接将分组放到最后
              pane.tabs = [...remainingTabs, ...movingTabs];
              console.log(
                "[TabStore][reorderTabGroup] target group has no tabs, append to end",
                {
                  paneId,
                  targetGroupId,
                  tabs: pane.tabs.map((t) => ({
                    id: t.id,
                    title: t.title,
                    groupId: t.groupId,
                  })),
                },
              );
              return;
            }

            const tabInsertIndex =
              position === "before" ? targetStart : targetEnd + 1;

            const newTabs: ITab[] = [];
            for (let i = 0; i < remainingTabs.length; i += 1) {
              if (i === tabInsertIndex) {
                newTabs.push(...movingTabs);
              }
              newTabs.push(remainingTabs[i]);
            }

            if (tabInsertIndex >= remainingTabs.length) {
              newTabs.push(...movingTabs);
            }

            pane.tabs = newTabs;

            console.log("[TabStore][reorderTabGroup] tabs after", {
              paneId,
              tabs: pane.tabs.map((t) => ({
                id: t.id,
                title: t.title,
                groupId: t.groupId,
              })),
            });
          }),
        );
      },

      // 导航操作
      navigateTo: <T extends TabType>(
        type: T,
        params?: TabParams[T],
        title?: string,
      ) => {
        const { activePaneId, findTab } = get();

        // 查找是否已存在相同类型和参数的 Tab
        const existing = findTab(type, params);

        if (existing) {
          // 如果存在，切换到该 Tab
          get().switchTab(existing.paneId, existing.tab.id);
        } else {
          // 否则在当前 pane 的当前 tab 中打开
          const pane = get().panes.find((p) => p.id === activePaneId);
          if (pane) {
            const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId);
            if (activeTab) {
              // 更新当前 Tab 的内容
              get().updateTab(activePaneId, activeTab.id, {
                type,
                params,
                title: title || TAB_TITLES[type],
              } as Partial<ITab<T>>);
            }
          }
        }
      },

      openInNewTab: <T extends TabType>(
        type: T,
        params?: TabParams[T],
        paneId?: string,
        title?: string,
      ) => {
        const { findTab } = get();

        // get().createTab(type, params, paneId, title);

        // 查找是否已存在相同类型和参数的 Tab
        const existing = findTab(type, params);

        if (existing) {
          // 如果存在，切换到该 Tab
          get().switchTab(existing.paneId, existing.tab.id);
        } else {
          // 否则创建新 Tab
          get().createTab(type, params, paneId, title);
        }
      },

      openInSplit: <T extends TabType>(
        type: T,
        params?: TabParams[T],
        direction = PaneDirection.Horizontal,
        title?: string,
      ) => {
        const newPaneId = get().createPane(direction);
        get().createTab(type, params, newPaneId, title);
      },

      // Sidebar 操作
      toggleSidebar: () => {
        set(
          produce((state: IState) => {
            state.sidebarCollapsed = !state.sidebarCollapsed;
          }),
        );
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed });
      },

      // 工具方法
      getActivePane: () => {
        const { panes, activePaneId } = get();
        return panes.find((p) => p.id === activePaneId);
      },

      getActiveTab: () => {
        const pane = get().getActivePane();
        if (!pane) return undefined;
        return pane.tabs.find((t) => t.id === pane.activeTabId);
      },

      findTab: (type: TabType, params?: unknown) => {
        const { panes } = get();
        for (const pane of panes) {
          for (const tab of pane.tabs) {
            if (tab.type === type) {
              // 如果没有 params，只匹配类型
              if (!params && !tab.params) {
                return { paneId: pane.id, tab };
              }
              // 如果有 params，需要深度比较
              if (
                params &&
                tab.params &&
                JSON.stringify(params) === JSON.stringify(tab.params)
              ) {
                return { paneId: pane.id, tab };
              }
            }
          }
        }
        return null;
      },
    }),
    {
      name: "tab-store",
      partialize: (state) => ({
        panes: state.panes,
        activePaneId: state.activePaneId,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);

export default useTabStore;
