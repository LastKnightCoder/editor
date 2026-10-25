import type { EditingContext } from "./editingContext";

/** 公式源码编辑的上下文 */
export type SourceEditingContext = Extract<EditingContext, { kind: "block-math" | "inline-math" }>;

/** 源码符号键：插入 text，cursorOffset 为光标相对插入起点的位置（缺省落在文本之后） */
export type SourceSymbolKey = {
  label: string;
  text: string;
  cursorOffset?: number;
  ariaLabel?: string;
};

const plain = (...texts: string[]): SourceSymbolKey[] => texts.map(text => ({ label: text, text }));

/** 括号对：插入后光标落在括号中间 */
const pair = (label: string, text: string): SourceSymbolKey => ({ label, text, cursorOffset: 1 });

export const MATH_SYMBOL_KEYS: SourceSymbolKey[] = [
  ...plain("\\", "^", "_"),
  pair("{ }", "{}"),
  pair("( )", "()"),
  { label: "\\frac", text: "\\frac{}{}", cursorOffset: 6 },
  { label: "\\sqrt", text: "\\sqrt{}", cursorOffset: 6 },
  ...plain("\\sum", "\\int", "\\alpha", "\\pi", "="),
];

const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
  HTMLTextAreaElement.prototype,
  "value"
)?.set;

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)?.set;

/**
 * 以原生输入的方式写入 textarea / input：替换当前选区，光标落到插入起点 + cursorOffset
 * （缺省为文本之后），再派发冒泡的 input 事件，受控组件经正常的 onChange 更新状态。
 */
export function insertIntoTextControl(
  control: HTMLTextAreaElement | HTMLInputElement,
  text: string,
  cursorOffset?: number
): void {
  const setter =
    control instanceof HTMLTextAreaElement ? nativeTextareaValueSetter : nativeInputValueSetter;
  if (control.readOnly || control.disabled || !setter) return;
  const start = control.selectionStart ?? control.value.length;
  const end = control.selectionEnd ?? start;
  const { value } = control;
  setter.call(control, `${value.slice(0, start)}${text}${value.slice(end)}`);
  const caret = start + (cursorOffset ?? text.length);
  control.setSelectionRange(caret, caret);
  control.dispatchEvent(new Event("input", { bubbles: true }));
}
