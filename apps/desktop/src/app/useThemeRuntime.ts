import { useEffect } from "react";
import { THEME_STORAGE_KEY } from "@tau/ui/theme";
import { initThemeRuntime, useThemeStore } from "@tau/ui/theme/runtime";

/**
 * 启动主题运行时，并跟随其它窗口的主题切换：主题存在 localStorage（同源窗口共享），
 * 任一窗口切换后其余窗口经 storage 事件同步（事件只投递给「其它」窗口，不会回环）。
 */
export function useThemeRuntime({ enabled = true }: { enabled?: boolean } = {}) {
  useEffect(() => {
    if (!enabled) return;
    const stopTheme = initThemeRuntime();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !event.newValue) return;
      try {
        useThemeStore.getState().setMode(event.newValue);
      } catch {
        /* 未注册的主题：保持当前 */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      stopTheme();
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled]);
}
