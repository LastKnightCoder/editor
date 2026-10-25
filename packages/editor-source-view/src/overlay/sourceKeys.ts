import type { KeyboardEvent } from "react";
import isHotkey from "is-hotkey";
import type { OverlayKeydownHelpers } from "./ShikiOverlayEditor";

export const SOURCE_INDENT = "  ";

const AUTO_CLOSE_PAIRS: Record<string, string> = {
  "(": ")",
  "{": "}",
  "[": "]",
  '"': '"',
  "'": "'",
  "`": "`",
};

export interface SourceKeyOptions {
  readOnly: boolean;
  /** 写入整段改动后的源码（代码块经自身的持久化，源码块经字段绑定或 onChange） */
  applyChange(value: string): void;
  /** 字段历史：给出时 mod+z / mod+shift+z / mod+y 走它，否则交给输入框 */
  history?: { undo(): void; redo(): void } | null;
  /** 源码为空时按退格或 Delete：删除整块 */
  deleteEmpty(): void;
  /** 光标在开头按上、在末尾按下：移到前一块或后一块，返回是否移动了 */
  focusOuter(direction: "backward" | "forward"): boolean;
}

const replaceRange = (source: string, start: number, end: number, text: string) =>
  `${source.slice(0, start)}${text}${source.slice(end)}`;

const hasModifier = (event: globalThis.KeyboardEvent) =>
  event.metaKey || event.ctrlKey || event.altKey;

/**
 * 叠层编辑器的源码按键（代码块与源码预览块共用）：字段撤销重做、空块退格删块、首末位置上下键跳块、
 * 括号引号成对、Tab / Shift+Tab 缩进、回车保持缩进（开括号后多缩一级）。返回是否已处理。
 */
export function handleSourceKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  helpers: OverlayKeydownHelpers,
  options: SourceKeyOptions
): boolean {
  const keyboardEvent = event.nativeEvent;
  if (keyboardEvent.isComposing) return false;
  const { readOnly, applyChange } = options;

  if (options.history && isHotkey(["mod+z", "mod+shift+z", "mod+y"], keyboardEvent)) {
    event.preventDefault();
    if (!readOnly) {
      if (isHotkey(["mod+shift+z", "mod+y"], keyboardEvent)) options.history.redo();
      else options.history.undo();
    }
    return true;
  }

  const value = helpers.getValue();
  const selection = helpers.getSelection();
  const isCollapsed = selection.start === selection.end;

  if (isHotkey(["delete", "backspace"], keyboardEvent) && value === "") {
    event.preventDefault();
    if (!readOnly) options.deleteEmpty();
    return true;
  }

  if (isHotkey("up", keyboardEvent) && isCollapsed) {
    const cursor = helpers.getCursor();
    if (cursor.line === 0 && cursor.ch === 0 && options.focusOuter("backward")) {
      event.preventDefault();
      return true;
    }
    return false;
  }

  if (isHotkey("down", keyboardEvent) && isCollapsed) {
    const cursor = helpers.getCursor();
    const lastLine = helpers.lastLine();
    if (
      cursor.line === lastLine &&
      cursor.ch === helpers.getLine(lastLine).length &&
      options.focusOuter("forward")
    ) {
      event.preventDefault();
      return true;
    }
    return false;
  }

  if (readOnly) return false;

  if (!hasModifier(keyboardEvent) && keyboardEvent.key in AUTO_CLOSE_PAIRS) {
    event.preventDefault();
    const close = AUTO_CLOSE_PAIRS[keyboardEvent.key];
    const wrapped = value.slice(selection.start, selection.end);
    applyChange(
      replaceRange(value, selection.start, selection.end, `${keyboardEvent.key}${wrapped}${close}`)
    );
    const cursor = isCollapsed ? selection.start + 1 : selection.end + 2;
    queueMicrotask(() => helpers.setSelection(cursor, cursor));
    return true;
  }

  if (keyboardEvent.key === "Tab") {
    event.preventDefault();
    const lineStart = value.lastIndexOf("\n", selection.start - 1) + 1;
    const lineEndRaw = value.indexOf("\n", selection.end);
    const lineEnd = lineEndRaw === -1 ? value.length : lineEndRaw;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    if (keyboardEvent.shiftKey) {
      const nextBlock = lines
        .map(line =>
          line.startsWith(SOURCE_INDENT)
            ? line.slice(SOURCE_INDENT.length)
            : line.startsWith("\t")
              ? line.slice(1)
              : line
        )
        .join("\n");
      applyChange(replaceRange(value, lineStart, lineEnd, nextBlock));
      queueMicrotask(() => {
        const shrink = block.length - nextBlock.length;
        if (isCollapsed) {
          const next = Math.max(
            lineStart,
            selection.start - Math.min(shrink, SOURCE_INDENT.length)
          );
          helpers.setSelection(next, next);
        } else {
          helpers.setSelection(lineStart, lineStart + nextBlock.length);
        }
      });
    } else {
      const nextBlock = lines.map(line => `${SOURCE_INDENT}${line}`).join("\n");
      applyChange(replaceRange(value, lineStart, lineEnd, nextBlock));
      queueMicrotask(() => {
        if (isCollapsed) {
          const next = selection.start + SOURCE_INDENT.length;
          helpers.setSelection(next, next);
        } else {
          helpers.setSelection(lineStart, lineStart + nextBlock.length);
        }
      });
    }
    return true;
  }

  if (keyboardEvent.key === "Enter" && !keyboardEvent.shiftKey && !hasModifier(keyboardEvent)) {
    event.preventDefault();
    const beforeCursor = value.slice(0, selection.start);
    const lineStart = beforeCursor.lastIndexOf("\n") + 1;
    const currentLineBeforeCursor = beforeCursor.slice(lineStart);
    const indent = currentLineBeforeCursor.match(/^[\t ]*/)?.[0] || "";
    const extraIndent = /[{[(]\s*$/.test(currentLineBeforeCursor) ? SOURCE_INDENT : "";
    const insertion = `\n${indent}${extraIndent}`;
    applyChange(replaceRange(value, selection.start, selection.end, insertion));
    const cursor = selection.start + insertion.length;
    queueMicrotask(() => helpers.setSelection(cursor, cursor));
    return true;
  }

  return false;
}
