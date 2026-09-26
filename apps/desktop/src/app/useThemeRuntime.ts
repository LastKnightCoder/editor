import { useEffect } from "react";
import { APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY, type ThemeMode } from "@tau/ui/theme";
import { initThemeRuntime, useThemeStore, type Appearance } from "@tau/ui/theme/runtime";

/**
 * 启动主题运行时，并跟随其它窗口的主题切换：主题族与明暗偏好存在 localStorage（同源窗口
 * 共享），任一窗口切换后其余窗口经 storage 事件同步（事件只投递给「其它」窗口，不会回环）。
 * forceMode：固定明暗（沉浸窗），主题族仍跟随。
 */
export function useThemeRuntime({
  enabled = true,
  forceMode,
}: { enabled?: boolean; forceMode?: ThemeMode } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const stopTheme = initThemeRuntime({ forceMode });
    const onStorage = (event: StorageEvent) => {
      if (!event.newValue) return;
      try {
        if (event.key === THEME_STORAGE_KEY) useThemeStore.getState().setTheme(event.newValue);
        else if (event.key === APPEARANCE_STORAGE_KEY)
          useThemeStore.getState().setAppearance(event.newValue as Appearance);
      } catch {
        /* 未注册的主题 / 未知偏好：保持当前 */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      stopTheme();
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, forceMode]);
}
