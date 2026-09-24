import { isMac } from "@/platform";

/**
 * 页面级快捷键的让位判定：有打开的 Dialog 或菜单时不处理。
 * 壳层常驻的浮层（搜索面板 / 设置弹窗带 inert、菜单关闭时 data-open=false）不算打开。
 */
export function overlayOpen(): boolean {
  return !!document.querySelector('[role="dialog"]:not([inert]), [role="menu"][data-open="true"]');
}

/** 快捷键修饰键的展示名：mac 为 ⌘，其余平台为 Ctrl+ */
export const MOD = isMac ? "⌘" : "Ctrl+";
