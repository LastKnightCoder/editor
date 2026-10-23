import type { BaseSelection, Editor } from "slate";
import { ReactEditor } from "slate-react";
import { restoreSelectionAndFocus } from "./toolbarActions";

/** 收键盘策略：blur 失焦；inputmode 设置 inputmode="none" 保留焦点 */
export type KeyboardSwapStrategy = "blur" | "inputmode";

export const DEFAULT_KEYBOARD_SWAP_STRATEGY: KeyboardSwapStrategy = "blur";

export const INPUTMODE_FALLBACK_MS = 300;

export type ShowKeyboardOptions = {
  /** 是否恢复保存的选区并聚焦，默认 true */
  restoreSelection?: boolean;
  /** inputmode 策略下判断键盘是否已弹出 */
  isKeyboardShown?: () => boolean;
  /** inputmode 策略下键盘未弹出、改走失焦重聚焦时调用 */
  onFallback?: () => void;
};

/** 收起键盘，编辑器选区保持不变 */
export function hideKeyboard(
  editor: Editor,
  strategy: KeyboardSwapStrategy,
  editableElement: HTMLElement | null | undefined
): void {
  if (strategy === "blur") {
    ReactEditor.blur(editor as ReactEditor);
    return;
  }
  editableElement?.setAttribute("inputmode", "none");
}

/**
 * 弹回键盘。inputmode 策略下若 INPUTMODE_FALLBACK_MS 后键盘仍未弹出，失焦后重新聚焦。
 * 返回取消函数，用于清理待执行的兜底。
 */
export function showKeyboard(
  editor: Editor,
  strategy: KeyboardSwapStrategy,
  editableElement: HTMLElement | null | undefined,
  savedSelection: BaseSelection | null,
  options: ShowKeyboardOptions = {}
): () => void {
  const { restoreSelection = true, isKeyboardShown, onFallback } = options;
  editableElement?.removeAttribute("inputmode");
  if (restoreSelection) {
    restoreSelectionAndFocus(editor, savedSelection);
  }
  if (strategy !== "inputmode") {
    return () => undefined;
  }
  const timer = window.setTimeout(() => {
    if (isKeyboardShown?.()) return;
    editableElement?.blur();
    restoreSelectionAndFocus(editor, savedSelection);
    onFallback?.();
  }, INPUTMODE_FALLBACK_MS);
  return () => window.clearTimeout(timer);
}

/** 退出编辑时清除收键盘留下的 inputmode 属性 */
export function clearKeyboardSwap(editableElement: HTMLElement | null | undefined): void {
  editableElement?.removeAttribute("inputmode");
}
