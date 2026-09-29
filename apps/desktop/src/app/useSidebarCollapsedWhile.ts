import { useEffect } from "react";
import { useShellStore } from "./shellStore";

/**
 * active 期间收起全局侧栏，结束时还原进入前的状态（闪卡沉浸复习、PDF 阅读页）。
 * Activity 隐藏会清理副作用（即还原），重新激活时再次收起。
 */
export function useSidebarCollapsedWhile(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const shell = useShellStore.getState();
    const previous = shell.sidebarCollapsed;
    shell.setSidebarCollapsed(true);
    return () => useShellStore.getState().setSidebarCollapsed(previous);
  }, [active]);
}
