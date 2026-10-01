import { Editor, Element, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import type { AnnotationElement } from "./types";
export const insertAnnotation = (editor: Editor, content: string) => {
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
};

export const isAnnotationActive = (editor: Editor) => {
  if (!editor.selection) return false;
  const [annotation] = Editor.nodes(editor, {
    match: n => !Editor.isEditor(n) && Element.isElement(n) && n.type === "annotation",
  });
  return !!annotation;
};
