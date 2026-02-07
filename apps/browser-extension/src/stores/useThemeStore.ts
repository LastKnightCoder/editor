import { useState, useEffect, useCallback } from "react";
import type { ThemeMode } from "../utils/types";

const STORAGE_KEY = "tau-theme-mode";
const DEFAULT_MODE: ThemeMode = "system";

/**
 * 主题设置持久化 Store
 * 使用 chrome.storage.local 持久化，支持跨 Tab 同步
 */
export function useThemeStore() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(DEFAULT_MODE);
  const [loaded, setLoaded] = useState(false);

  // 初始化时从 storage 读取
  useEffect(() => {
    const loadTheme = async () => {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          const result = await chrome.storage.local.get(STORAGE_KEY);
          if (result[STORAGE_KEY]) {
            setThemeModeState(result[STORAGE_KEY] as ThemeMode);
          }
        }
      } catch {
        // storage 不可用时使用默认值
      } finally {
        setLoaded(true);
      }
    };
    loadTheme();

    // 监听其他 Tab 的变更
    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area === "local" && changes[STORAGE_KEY]) {
        setThemeModeState(changes[STORAGE_KEY].newValue as ThemeMode);
      }
    };

    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(handleChange);
      return () => chrome.storage.onChanged.removeListener(handleChange);
    }
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.set({ [STORAGE_KEY]: mode });
      }
    } catch {
      // 静默失败
    }
  }, []);

  return { themeMode, setThemeMode, loaded };
}
