import useTabStore from "@/stores/useTabStore";
import useNavigationHistoryStore from "@/stores/useNavigationHistoryStore";
import { TabType, TabParams, TAB_TITLES, PaneDirection } from "@/types/tab";

export function navigateTo<T extends TabType>(
  type: T,
  params?: TabParams[T],
  title?: string,
): void {
  const store = useTabStore.getState();
  const historyStore = useNavigationHistoryStore.getState();

  const finalTitle = title || TAB_TITLES[type];

  // 添加到历史记录
  historyStore.addToHistory(type, params, finalTitle);

  // 导航
  store.navigateTo(type, params, finalTitle);
}

export function openInNewTab<T extends TabType>(
  type: T,
  params?: TabParams[T],
  paneId?: string,
  title?: string,
): void {
  const store = useTabStore.getState();
  const historyStore = useNavigationHistoryStore.getState();

  const finalTitle = title || TAB_TITLES[type];

  // 添加到历史记录
  historyStore.addToHistory(type, params, finalTitle);

  // 在新 Tab 打开
  store.openInNewTab(type, params, paneId, finalTitle);
}

/**
 * 分屏打开页面
 */
export function openInSplit<T extends TabType>(
  type: T,
  params?: TabParams[T],
  direction: PaneDirection = PaneDirection.Horizontal,
  title?: string,
): void {
  const store = useTabStore.getState();
  const historyStore = useNavigationHistoryStore.getState();

  const finalTitle = title || TAB_TITLES[type];

  // 添加到历史记录
  historyStore.addToHistory(type, params, finalTitle);

  // 分屏打开
  store.openInSplit(type, params, direction, finalTitle);
}

/**
 * 获取当前活动的 Tab
 */
export function getActiveTab() {
  const store = useTabStore.getState();
  return store.getActiveTab();
}

/**
 * 获取当前活动的 Pane
 */
export function getActivePane() {
  const store = useTabStore.getState();
  return store.getActivePane();
}

/**
 * 关闭指定的 Tab
 */
export function closeTab(paneId: string, tabId: string): void {
  const store = useTabStore.getState();
  store.closeTab(paneId, tabId);
}

/**
 * 切换到指定的 Tab
 */
export function switchTab(paneId: string, tabId: string): void {
  const store = useTabStore.getState();
  store.switchTab(paneId, tabId);
}

/**
 * 创建新的 Pane（分屏）
 */
export function createPane(
  direction: PaneDirection = PaneDirection.Horizontal,
  splitRatio = 0.5,
): string {
  const store = useTabStore.getState();
  return store.createPane(direction, splitRatio);
}

/**
 * 关闭指定的 Pane
 */
export function closePane(paneId: string): void {
  const store = useTabStore.getState();
  store.closePane(paneId);
}
