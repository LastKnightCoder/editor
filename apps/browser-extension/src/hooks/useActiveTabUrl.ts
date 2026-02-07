import { useState, useEffect } from "react";

/**
 * 追踪当前活动标签页的 URL
 * 监听 tab 切换和页面导航事件
 */
export function useActiveTabUrl() {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    // 初始获取当前活动 tab 的 URL
    const getCurrentTabUrl = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.url) {
          setUrl(tab.url);
        }
      } catch (error) {
        console.error("Failed to get current tab URL:", error);
      }
    };

    getCurrentTabUrl();

    // 监听 tab 切换事件
    const handleActivated = async (activeInfo: chrome.tabs.TabActiveInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab?.url) {
          setUrl(tab.url);
        }
      } catch (error) {
        console.error("Failed to get tab URL on activation:", error);
      }
    };

    // 监听页面导航事件（URL 变化）
    const handleUpdated = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab,
    ) => {
      // 只在导航完成且是当前活动 tab 时更新
      if (changeInfo.status === "complete" && tab.active && tab.url) {
        setUrl(tab.url);
      }
    };

    chrome.tabs.onActivated.addListener(handleActivated);
    chrome.tabs.onUpdated.addListener(handleUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleActivated);
      chrome.tabs.onUpdated.removeListener(handleUpdated);
    };
  }, []);

  return { url };
}
