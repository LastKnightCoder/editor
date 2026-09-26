import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 模态容器的 Tab 首尾圈闭（Dialog / Drawer 共用）：只在首尾处接管，中间走浏览器默认顺序 */
export function trapTabKey(e: ReactKeyboardEvent, container: HTMLElement | null) {
  const focusables = [...(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
  if (focusables.length === 0) return;
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
