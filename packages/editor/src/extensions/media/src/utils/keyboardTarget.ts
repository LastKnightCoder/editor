/** 按键目标是文本输入（input / textarea / 可编辑区）：块级快捷键不拦截 */
export const isTextTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return true;
  // isContentEditable 在部分环境（jsdom）缺失，按属性兜底
  const editable = el.closest?.("[contenteditable]")?.getAttribute("contenteditable");
  return editable != null && editable !== "false";
};

/** 按键目标在浮层里（灯箱、裁剪编辑器、对话框）：交给浮层自己处理 */
export const isOverlayTarget = (target: EventTarget | null) =>
  !!(target as HTMLElement | null)?.closest?.('[aria-modal="true"], [role="menu"]');

/**
 * 选中媒体块时的块级快捷键是否应忽略这次按键：输入法组合、浮层内、文本输入（如说明框）都不处理。
 * 点选块后焦点通常留在外层编辑器根上——它包含这个块，不算文本输入，快捷键照常生效。
 */
export function shouldIgnoreBlockKey(event: KeyboardEvent, block: HTMLElement | null) {
  if (event.isComposing || isOverlayTarget(event.target)) return true;
  const el = event.target as HTMLElement | null;
  if (block && el?.contains?.(block)) return false;
  return isTextTarget(el);
}
