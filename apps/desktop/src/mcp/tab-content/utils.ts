import useTabStore from "@/stores/useTabStore";
import { tabContentRegistry } from "./registry";
import type {
  TabContentResponse,
  PaneContentResponse,
  TabContentOptions,
} from "./types";
import type { ITab, IPane } from "@/types/tab";

/**
 * 获取当前所有 Panes 的信息
 */
export function getCurrentPanels(): PaneContentResponse[] {
  const state = useTabStore.getState();

  return state.panes.map((pane) => ({
    paneId: pane.id,
    activeTabId: pane.activeTabId,
    tabCount: pane.tabs.length,
    direction: pane.direction,
    splitRatio: pane.splitRatio,
    groups: pane.groups?.map((group) => ({
      id: group.id,
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
    })),
    tabs: pane.tabs.map((tab) => ({
      id: tab.id,
      type: tab.type,
      title: tab.title,
      isActive: tab.id === pane.activeTabId,
      hasParams: !!tab.params,
    })),
  }));
}

/**
 * 获取指定 Pane 下的所有 Tabs
 */
export function getPaneTabs(paneId: string): PaneContentResponse | null {
  const state = useTabStore.getState();
  const pane = state.panes.find((p) => p.id === paneId);

  if (!pane) {
    return null;
  }

  return {
    paneId: pane.id,
    activeTabId: pane.activeTabId,
    tabCount: pane.tabs.length,
    direction: pane.direction,
    splitRatio: pane.splitRatio,
    groups: pane.groups?.map((group) => ({
      id: group.id,
      title: group.title,
      color: group.color,
      collapsed: group.collapsed,
    })),
    tabs: pane.tabs.map((tab) => ({
      id: tab.id,
      type: tab.type,
      title: tab.title,
      isActive: tab.id === pane.activeTabId,
      hasParams: !!tab.params,
    })),
  };
}

/**
 * 获取当前激活的 Tab
 */
export function getActiveTab(): {
  paneId: string;
  tab: ITab;
  isActive: true;
} | null {
  const state = useTabStore.getState();
  const activePane = state.panes.find((p) => p.id === state.activePaneId);

  if (!activePane) {
    return null;
  }

  const activeTab = activePane.tabs.find(
    (t) => t.id === activePane.activeTabId,
  );

  if (!activeTab) {
    return null;
  }

  return {
    paneId: activePane.id,
    tab: activeTab,
    isActive: true,
  };
}

/**
 * 获取指定 Tab 的内容
 */
export async function getTabContent(
  tabId: string,
  options?: TabContentOptions,
): Promise<TabContentResponse | null> {
  const state = useTabStore.getState();

  // 查找 tab
  let foundPane: IPane | null = null;
  let foundTab: ITab | null = null;

  for (const pane of state.panes) {
    const tab = pane.tabs.find((t) => t.id === tabId);
    if (tab) {
      foundPane = pane;
      foundTab = tab;
      break;
    }
  }

  if (!foundTab || !foundPane) {
    return null;
  }

  // 获取对应的 provider
  const provider = tabContentRegistry.getProvider(foundTab.type);

  if (!provider) {
    throw new Error(`No provider registered for tab type: ${foundTab.type}`);
  }

  // 获取内容
  const isActive = foundTab.id === foundPane.activeTabId;
  const content = await provider.getContent(foundTab, options);

  // 添加 paneId 和 isActive 信息
  content.metadata.paneId = foundPane.id;
  content.metadata.isActive = isActive;

  return content;
}

/**
 * 获取当前激活 Tab 的内容
 */
export async function getActiveTabContent(
  options?: TabContentOptions,
): Promise<TabContentResponse | null> {
  const activeTabInfo = getActiveTab();

  if (!activeTabInfo) {
    return null;
  }

  return getTabContent(activeTabInfo.tab.id, options);
}
