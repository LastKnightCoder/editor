import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "tau-auto-summary-enabled";
const DEFAULT_ENABLED = false;

/**
 * 自动总结设置持久化 Store
 * 使用 chrome.storage.local 持久化，支持跨 Tab 同步
 */
export function useSettingsStore() {
  const [autoSummaryEnabled, setAutoSummaryEnabledState] =
    useState<boolean>(DEFAULT_ENABLED);
  const [loaded, setLoaded] = useState(false);

  // 初始化时从 storage 读取
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          const result = await chrome.storage.local.get(STORAGE_KEY);
          if (result[STORAGE_KEY] !== undefined) {
            setAutoSummaryEnabledState(result[STORAGE_KEY] as boolean);
          }
        }
      } catch {
        // storage 不可用时使用默认值
      } finally {
        setLoaded(true);
      }
    };
    loadSettings();

    // 监听其他 Tab 的变更
    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes[STORAGE_KEY]) {
        setAutoSummaryEnabledState(changes[STORAGE_KEY].newValue as boolean);
      }
    };

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleChange);
      return () => chrome.storage.onChanged.removeListener(handleChange);
    }
  }, []);

  const setAutoSummaryEnabled = useCallback((enabled: boolean) => {
    setAutoSummaryEnabledState(enabled);
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: enabled });
      }
    } catch {
      // 静默失败
    }
  }, []);

  return { autoSummaryEnabled, setAutoSummaryEnabled, loaded };
}
