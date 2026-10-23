import { type Editor } from "slate";
import { ReactEditor } from "slate-react";
import { setOrInsertNode } from "@tau/editor/api";
import type { HeaderElement } from "./types";

export const insertHeader = (editor: Editor, level: HeaderElement["level"]) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  setOrInsertNode(
    editor,
    {
      type: "header",
      level,
      children: [{ type: "formatted", text: "" }],
    },
    { select: true }
  );
};

const headerIndexes = new WeakMap<
  Editor,
  { children: Editor["children"]; headers: HeaderElement[] }
>();

/** 目录仅索引顶层标题，按当前文档节点解析 DOM，避免使用宿主快照中的旧引用。 */
export function resolveHeaderAnchor(editor: Editor | undefined, index: number): HTMLElement | null {
  if (!editor || !Number.isInteger(index) || index < 0) return null;
  let cached = headerIndexes.get(editor);
  if (cached?.children !== editor.children) {
    cached = {
      children: editor.children,
      headers: editor.children.filter((node): node is HeaderElement => node.type === "header"),
    };
    headerIndexes.set(editor, cached);
  }
  const header = cached.headers[index];
  if (!header) return null;
  try {
    return ReactEditor.toDOMNode(editor, header);
  } catch {
    return null;
  }
}

export function scrollHeaderIntoView(editor: Editor | undefined, index: number): void {
  resolveHeaderAnchor(editor, index)?.scrollIntoView({ behavior: "smooth" });
}
