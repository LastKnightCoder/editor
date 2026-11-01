import { Editor, Element, Path, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { AnnotationElement } from "./types";

const isAnnotationNode = (node: unknown): node is AnnotationElement =>
  Element.isElement(node) && node.type === "annotation";

/** 刚插入、等待渲染后直接进入编辑的注解位置 */
const pendingEdit = new WeakMap<Editor, Path>();

export const insertAnnotation = (editor: Editor, content = "") => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;

  if (editor.selection && !Range.isCollapsed(editor.selection)) {
    Transforms.collapse(editor, { edge: "end" });
  }

  const annotation: AnnotationElement = {
    type: "annotation",
    content,
    children: [{ type: "formatted", text: "" }],
  };

  Transforms.insertNodes(editor, annotation);
  // 插入后选区在注解内部或紧随其后
  const selection = editor.selection;
  if (!selection) return;
  const [inside] = Editor.nodes(editor, {
    at: selection,
    match: isAnnotationNode,
    voids: true,
  });
  const inserted =
    inside ??
    Editor.previous(editor, {
      at: selection,
      match: isAnnotationNode,
      voids: true,
    });
  if (inserted) pendingEdit.set(editor, inserted[1]);
};

/** 注解挂载时调用：是刚插入的那个则返回 true 并清除标记 */
export const consumePendingEdit = (editor: Editor, path: Path): boolean => {
  const pending = pendingEdit.get(editor);
  if (!pending || !Path.equals(pending, path)) return false;
  pendingEdit.delete(editor);
  return true;
};

export const isAnnotationActive = (editor: Editor) => {
  if (!editor.selection) return false;
  const [annotation] = Editor.nodes(editor, {
    match: n => !Editor.isEditor(n) && Element.isElement(n) && n.type === "annotation",
  });
  return !!annotation;
};
