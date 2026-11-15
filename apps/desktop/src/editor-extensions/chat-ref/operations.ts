/**
 * 聊天引用写入正文：行内引用插在光标处，摘录块插在光标所在块之后。一次插入一次撤销。
 * 对话侧（停靠栏、对话页）调用 insertChatRefIntoActiveEditor，找不到可写正文时改为复制链接。
 */

import { Editor, Element, Path, Point, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { withNewUndoStep } from "@tau/editor/api";
import { toast } from "@tau/ui";
import { getActiveEditingTarget } from "@/services/content-editing/active-editor-session";
import type { ChatQuoteElement, ChatRefElement, ChatRefPayload } from "./types";
import { copyChatRefLink } from "./link";

export type ChatRefInsertMode = "inline" | "quote";

const EMPTY = [{ type: "formatted" as const, text: "" }];

export const toChatRefElement = (ref: ChatRefPayload): ChatRefElement => ({
  type: "chat-ref",
  sessionId: ref.sessionId,
  ...(ref.entryId ? { entryId: ref.entryId } : {}),
  title: ref.title,
  ...(ref.turn ? { turn: ref.turn } : {}),
  children: EMPTY,
});

export const toChatQuoteElement = (ref: ChatRefPayload): ChatQuoteElement | null =>
  ref.entryId && ref.text?.trim()
    ? {
        type: "chat-quote",
        sessionId: ref.sessionId,
        entryId: ref.entryId,
        quoteText: ref.text.trim(),
        title: ref.title,
        ...(ref.turn ? { turn: ref.turn } : {}),
        ...(ref.model ? { model: ref.model } : {}),
        children: EMPTY,
      }
    : null;

/** 光标所在的顶层块路径；没有选区时用最后一块 */
const currentBlockPath = (editor: Editor): Path | null => {
  if (editor.selection) return [editor.selection.anchor.path[0]];
  return editor.children.length ? [editor.children.length - 1] : null;
};

export function chatRefInsertionPoint(editor: Editor, selection: Range | null): Point | null {
  if (!selection) return null;
  const blockAt = (point: Point) =>
    Editor.above(editor, {
      at: point,
      match: node => Element.isElement(node) && Editor.isBlock(editor, node),
      mode: "lowest",
    });
  const end = Range.end(selection);
  const target = blockAt(end);
  if (!target || (target[0] as { type?: string }).type !== "paragraph") return null;
  const start = Range.isCollapsed(selection) ? target : blockAt(Range.start(selection));
  return start && Path.equals(start[1], target[1]) && !Editor.void(editor, { at: end })
    ? end
    : null;
}

export function insertChatRef(
  editor: Editor,
  ref: ChatRefPayload,
  mode: ChatRefInsertMode,
  selection = editor.selection ??
    (editor.children.length ? Editor.range(editor, Editor.end(editor, [])) : null)
): boolean {
  const quote = mode === "quote" ? toChatQuoteElement(ref) : null;
  if (quote) {
    const at = currentBlockPath(editor);
    const next = at ? Path.next(at) : [0];
    withNewUndoStep(
      editor,
      () => {
        Transforms.insertNodes(editor, quote, { at: next, select: true });
      },
      { isolate: true }
    );
    return true;
  }
  const point = chatRefInsertionPoint(editor, selection);
  if (!point || !selection) return false;
  const follow = !editor.selection || Range.equals(editor.selection, selection);
  withNewUndoStep(
    editor,
    () => {
      Transforms.insertNodes(editor, toChatRefElement(ref), { at: point, select: follow });
      if (follow) Transforms.move(editor);
    },
    { isolate: true }
  );
  return true;
}

/** 当前窗口里最近在写的正文（卡片 / 文章 / 项目文档 / 日记），只读或已卸载时为 null */
export function activeWritableEditor(): Editor | null {
  const target = getActiveEditingTarget();
  if (!target) return null;
  try {
    const { editor } = target;
    if (ReactEditor.isReadOnly(editor as ReactEditor)) return null;
    // 编辑器已卸载时取不到 DOM，会抛错
    ReactEditor.toDOMNode(editor as ReactEditor, editor);
    return editor;
  } catch {
    return null;
  }
}

/**
 * 对话里的「引用」：有可写正文就插进去，否则复制链接。
 * 返回实际做了什么，调用方据此给提示（插入成功不打扰）。
 */
export async function insertChatRefIntoActiveEditor(
  ref: ChatRefPayload,
  mode: ChatRefInsertMode
): Promise<"inserted" | "copied"> {
  const editor = activeWritableEditor();
  if (editor && insertChatRef(editor, ref, mode)) {
    try {
      ReactEditor.focus(editor as ReactEditor);
    } catch {
      // 编辑器所在的栏已收起：插入照常生效
    }
    return "inserted";
  }
  await copyChatRefLink(ref);
  toast.success("已复制引用链接，可粘贴到正文");
  return "copied";
}
