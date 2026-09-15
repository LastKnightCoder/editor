/**
 * 键盘导航仲裁用的 DOM 判断 —— Esc / Alt+方向键 不应闯入正在编辑的上下文
 * （输入框里的 Esc 语义是取消编辑/失焦，macOS 的 Option+←/→ 是按词移动光标）。
 */

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
