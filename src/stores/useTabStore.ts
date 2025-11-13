import { create } from "zustand";
import { persist } from "zustand/middleware";
import { produce } from "immer";
import { v4 as uuidv4 } from "uuid";
import {
  ITab,
  IPane,
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

            // 创建新 pane 并添加 tab
            const newPane: IPane = {
              id: newPaneId,
              tabs: [tab],
              activeTabId: tabId,
              direction,
              splitRatio,
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
