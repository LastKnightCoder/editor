import { Editor, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { getCurrentTextNode } from "@tau/editor/api";
export const unwrapUnderline = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  Transforms.unwrapNodes(editor, {
    match: n => n.type === "underline",
  });
};

export const wrapUnderline = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection) || ReactEditor.isReadOnly(editor)) return;
  const node = getCurrentTextNode(editor)?.[0];
  if (node?.type === "formatted") {
    const text = Editor.string(editor, selection);
    editor.deleteBackward("character");
    Transforms.wrapNodes(
      editor,
      {
        type: "underline",
        color: localStorage.getItem("underline-color") || "red",
        lineType: localStorage.getItem("underline-line-type") || "solid",
        colorSelectOpen: false,
        children: [{ type: "formatted", text }],
      },
      {
        at: selection,
        split: true,
      }
    );
  }
};
