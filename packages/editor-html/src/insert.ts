import { Transforms, type Editor } from "slate";
import { setOrInsertNode, focusInsertedPreviewElement } from "@tau/editor/api";
import type { HTMLInlineElement } from "./types";

export const insertHTMLBlock = (editor: Editor) => {
  const path = setOrInsertNode(editor, {
    type: "html-block",
    html: "",
    children: [{ type: "formatted", text: "" }],
  });
  focusInsertedPreviewElement(editor, path);
  return path;
};

/** 插入面板允许无选区追加；程序化插入仍保留显式选区保护。 */
export function insertInlineHtml(editor: Editor): void {
  const node: HTMLInlineElement = {
    type: "html-inline",
    html: "",
    children: [{ type: "formatted", text: "" }],
  };
  Transforms.insertNodes(editor, node);
}

export const insertInlineHtmlElement = (editor: Editor, html: string, openEdit?: boolean) => {
  if (!editor.selection) return;
  const node: HTMLInlineElement = {
    type: "html-inline",
    html,
    openEdit,
    children: [{ type: "formatted", text: "" }],
  };
  Transforms.insertNodes(editor, node);
};
