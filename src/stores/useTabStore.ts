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
  createPane: (direction?: PaneDirection, splitRatio?: number) => string;
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

// 在 initialState 后设置 activePaneId
initialState.activePaneId = initialState.panes[0].id;

const useTabStore = create<IState & IActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      // Pane 操作
      createPane: (direction = PaneDirection.Horizontal, splitRatio = 0.5) => {
        const paneId = uuidv4();
        const homeTabId = uuidv4();
        const newPane: IPane = {
          id: paneId,
          tabs: [
            {
              id: homeTabId,
              type: TabType.Home,
              title: TAB_TITLES[TabType.Home],
              closable: false,
            },
          ],
          activeTabId: homeTabId,
          direction,
          splitRatio,
        };
        set(
          produce((state: IState) => {
            state.panes.push(newPane);
            state.activePaneId = paneId;
          }),
        );
        return paneId;
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
