import { useState, useEffect } from "react";

export interface ActiveTabInfo {
  url: string | null;
  title: string | null;
  favIconUrl: string | null;
}

const EMPTY: ActiveTabInfo = { url: null, title: null, favIconUrl: null };

const toInfo = (tab: chrome.tabs.Tab | undefined): ActiveTabInfo | null =>
  tab?.url ? { url: tab.url, title: tab.title ?? null, favIconUrl: tab.favIconUrl ?? null } : null;

/**
 * 追踪当前活动标签页（URL、标题、站点图标）
 * URL 只在导航完成时更新（各分区按 URL 重载数据）；标题与图标随加载过程刷新
 */
export function useActiveTab(): ActiveTabInfo {
  const [info, setInfo] = useState<ActiveTabInfo>(EMPTY);

  useEffect(() => {
    const apply = (tab: chrome.tabs.Tab | undefined) => {
      const next = toInfo(tab);
      if (next) setInfo(next);
    };

    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then(([tab]) => apply(tab))
      .catch(error => console.error("Failed to get current tab:", error));

    const handleActivated = async (activeInfo: chrome.tabs.OnActivatedInfo) => {
      try {
        apply(await chrome.tabs.get(activeInfo.tabId));
      } catch (error) {
        console.error("Failed to get tab on activation:", error);
      }
    };

    const handleUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.OnUpdatedInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (!tab.active || !tab.url) return;
      if (changeInfo.status === "complete") {
        apply(tab);
      } else if (changeInfo.title || changeInfo.favIconUrl) {
        // 同一页面的标题 / 图标后到：只在 URL 未变时补上，避免提前切换数据
        setInfo(prev =>
          prev.url === tab.url
            ? {
                ...prev,
                title: tab.title ?? prev.title,
                favIconUrl: tab.favIconUrl ?? prev.favIconUrl,
              }
            : prev
        );
      }
    };

    chrome.tabs.onActivated.addListener(handleActivated);
    chrome.tabs.onUpdated.addListener(handleUpdated);
    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, []);

  return info;
}
