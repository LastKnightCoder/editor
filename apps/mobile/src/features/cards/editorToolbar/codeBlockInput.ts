import { getCodeBlockController } from "@tau/editor/extensions/code-block/runtime";
import { CODE_BLOCK_LANGUAGE_OPTIONS, normalizeCodeBlockLanguageDisplayName } from "@tau/shared";
import { Element as SlateElement, Node as SlateNode, type Editor as SlateEditor } from "slate";

import type { CodeEditingContext } from "./editingContext";
import { insertIntoTextControl } from "./sourceEditorInput";

/** 代码块配件栏的符号键：key 走 pressCodeKey（组件按真实按键处理），text 直接插入 */
export type CodeSymbolKey =
  | { kind: "tab"; label: "Tab" }
  | { kind: "key"; label: string; key: string }
  | { kind: "text"; label: string; text: string };

export type CodeSymbolFamily = "c-like" | "python" | "shell" | "sql" | "markdown" | "default";

const TAB_KEY: CodeSymbolKey = { kind: "tab", label: "Tab" };

const keys = (...chars: string[]): CodeSymbolKey[] =>
  chars.map(char => ({ kind: "key", label: char, key: char }));

/** 按语言族给出的符号键集合，顺序即展示顺序 */
export const CODE_SYMBOL_SETS: Record<CodeSymbolFamily, CodeSymbolKey[]> = {
  "c-like": [
    TAB_KEY,
    ...keys("(", ")", "{", "}", "[", "]", ";", "=", '"', "'", "/"),
    { kind: "text", label: "=>", text: "=>" },
  ],
  python: [TAB_KEY, ...keys("(", ")", "[", "]", ":", "=", '"', "'", "#")],
  shell: [TAB_KEY, ...keys("|", "$", '"', "'", "-", "/", "~", ">")],
  sql: [TAB_KEY, ...keys("(", ")", ",", ";", "=", "'", "*")],
  markdown: keys("#", "*", "`", "-", "[", "]", "(", ")", ">"),
  default: [TAB_KEY, ...keys("(", ")", "{", "}", "[", "]", ";", "=", '"', "'")],
};

/** 语言显示名（normalizeCodeBlockLanguageDisplayName 的结果）到语言族；未列出的走 default */
const LANGUAGE_FAMILIES: Record<string, CodeSymbolFamily> = {
  TypeScript: "c-like",
  JavaScript: "c-like",
  JSX: "c-like",
  TSX: "c-like",
  Java: "c-like",
  Kotlin: "c-like",
  Scala: "c-like",
  Swift: "c-like",
  Go: "c-like",
  Rust: "c-like",
  C: "c-like",
  "C++": "c-like",
  "C#": "c-like",
  "Objective C": "c-like",
  PHP: "c-like",
  JSON: "c-like",
  CSS: "c-like",
  SCSS: "c-like",
  Python: "python",
  Shell: "shell",
  Bash: "shell",
  PowerShell: "shell",
  Dockerfile: "shell",
  SQL: "sql",
  MySQL: "sql",
  Markdown: "markdown",
};

export function resolveCodeSymbolFamily(language: unknown): CodeSymbolFamily {
  return LANGUAGE_FAMILIES[normalizeCodeBlockLanguageDisplayName(language)] ?? "default";
}

export function getCodeSymbolKeys(language: unknown): CodeSymbolKey[] {
  return CODE_SYMBOL_SETS[resolveCodeSymbolFamily(language)];
}

const PLAIN_TEXT_LANGUAGE = "Plain Text";

/** 语言标签文字：空或纯文本显示「纯文本」 */
export function getCodeLanguageLabel(language: unknown): string {
  const name = normalizeCodeBlockLanguageDisplayName(language);
  return !name || name === PLAIN_TEXT_LANGUAGE ? "纯文本" : name;
}

const COMMON_LANGUAGE_VALUES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Java",
  "Go",
  "Rust",
  "C++",
  "Shell",
  "JSON",
  "SQL",
  "Markdown",
  PLAIN_TEXT_LANGUAGE,
];

export type CodeLanguageOption = { label: string; value: string };

const toLanguageOption = (value: string): CodeLanguageOption => ({
  label: value === PLAIN_TEXT_LANGUAGE ? "纯文本" : value,
  value,
});

/** 语言选择首屏的常用语言，只保留语言表中实际存在的值 */
export const COMMON_CODE_LANGUAGES: CodeLanguageOption[] = COMMON_LANGUAGE_VALUES.filter(value =>
  CODE_BLOCK_LANGUAGE_OPTIONS.some(option => option.value === value)
).map(toLanguageOption);

export const ALL_CODE_LANGUAGES: CodeLanguageOption[] = CODE_BLOCK_LANGUAGE_OPTIONS.map(option =>
  toLanguageOption(option.value)
);

/** 替换选区插入文本、光标落到插入文本之后，经 input 事件走组件 onChange 持久化 */
export function insertCodeText(textarea: HTMLTextAreaElement, text: string): void {
  insertIntoTextControl(textarea, text);
}

/**
 * 在 textarea 上派发 keydown，由组件自己的按键逻辑处理（Tab 缩进、括号闭合等）；
 * 组件未处理（未 preventDefault）的单字符键按文本插入。
 */
export function pressCodeKey(
  textarea: HTMLTextAreaElement,
  key: string,
  options: { shiftKey?: boolean } = {}
): void {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey: options.shiftKey ?? false,
    bubbles: true,
    cancelable: true,
  });
  const notHandled = textarea.dispatchEvent(event);
  if (notHandled && key.length === 1) {
    insertCodeText(textarea, key);
  }
}

/** 按路径取当前代码块节点（上下文里的节点对象在代码持久化后会过期），uuid 不符视为已不是同一块 */
function getCurrentCodeBlock(editor: SlateEditor, context: CodeEditingContext) {
  if (!SlateNode.has(editor, context.path)) return null;
  const node = SlateNode.get(editor, context.path);
  if (!SlateElement.isElement(node) || (node as { type?: unknown }).type !== "code-block") {
    return null;
  }
  if (context.uuid && (node as { uuid?: unknown }).uuid !== context.uuid) return null;
  return node;
}

/** 经 `tau.code-block.set-language` 命令设置语言；代码块已不存在时返回 false */
export function setCodeBlockLanguage(
  editor: SlateEditor,
  context: CodeEditingContext,
  language: string
): boolean {
  const element = getCurrentCodeBlock(editor, context);
  if (!element) return false;
  return (
    editor.commands?.execute("tau.code-block.set-language", { language }, element, context.path) ??
    false
  );
}

/** 聚焦代码块输入框：优先代码块控制器，未注册时直接聚焦上下文记录的 textarea */
export function focusCodeBlockInput(context: CodeEditingContext): void {
  const controller = context.uuid ? getCodeBlockController(context.uuid) : undefined;
  if (controller) {
    controller.focus();
    return;
  }
  if (context.textarea.isConnected) context.textarea.focus();
}
