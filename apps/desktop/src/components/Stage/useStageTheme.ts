import { useCallback, useState } from "react";
import { useThemeStore, type ThemeMode } from "@tau/themes/react";

/**
 * 全屏舞台的局部深浅色：只作用于舞台根节点（沿用当前主题族），不写全局偏好、不动 <html>。
 * 根节点铺 rootProps，内容再包 EditorThemeOverride mode={mode}（编辑器 JS 取色随之切换）。
 * 已知边界：经 Portal 挂在 body 的浮层（Tooltip、编辑器工具栏）仍随应用明暗。
 */
export function useStageTheme() {
  const themeKey = useThemeStore(s => s.theme);
  const appMode = useThemeStore(s => s.mode);
  const [mode, setMode] = useState<ThemeMode>(appMode);
  const toggle = useCallback(() => setMode(m => (m === "dark" ? "light" : "dark")), []);

  return {
    mode,
    toggle,
    rootProps: {
      "data-theme": themeKey,
      "data-mode": mode,
      style: { colorScheme: mode },
    },
    scopeClass: mode === "dark" ? "th-scope-dark" : "th-scope-light",
  };
}
