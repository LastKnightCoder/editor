import { useState, useEffect } from "react";
import type { ThemeMode, ResolvedTheme } from "../utils/types";

/**
 * 主题计算 Hook
 * 根据 themeMode 计算最终生效的主题
 * sidePanel 模式下仅支持 system / light / dark
 */
export function useTheme(themeMode: ThemeMode): ResolvedTheme {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (themeMode === "light") return "light";
    if (themeMode === "dark") return "dark";
    // system 模式：初始值根据当前系统偏好
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  });

  useEffect(() => {
    if (themeMode === "light") {
      setResolvedTheme("light");
      return;
    }
    if (themeMode === "dark") {
      setResolvedTheme("dark");
      return;
    }

    // system 模式：监听系统主题变化
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setResolvedTheme(mql.matches ? "dark" : "light");
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [themeMode]);

  return resolvedTheme;
}
