import type { ThemeColors as ModalThemeColors } from "@tau/shared";

/**
 * 编辑器内弹窗（@tau/shared 的 CustomModal）的外观：统一走 --ed-* token。
 * CustomModal 的契约要 Tailwind 类名，这里用任意值语法引用 token，等价于组件自己写 --ed-*。
 */
export const EDITOR_MODAL_THEME: ModalThemeColors = {
  borderClass: "border-[var(--ed-border)]",
  hoverClass: "hover:bg-[var(--ed-bg-hover)]",
  textClass: "text-[var(--ed-text)]",
  buttonBg: "bg-[var(--ed-accent)] hover:bg-[var(--ed-accent-hover)]",
  buttonTextClass: "text-[var(--ed-text-inverse)]",
};
