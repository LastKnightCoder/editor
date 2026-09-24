import { useShellStore } from "@/app/shellStore";
import { useEffect } from "react";

/** Activity 隐藏会清理副作用，重新激活时再次进入沉浸布局。 */
export function useReviewSidebar(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const shell = useShellStore.getState();
    const previous = shell.sidebarCollapsed;
    shell.setSidebarCollapsed(true);
    return () => useShellStore.getState().setSidebarCollapsed(previous);
  }, [active]);
}
