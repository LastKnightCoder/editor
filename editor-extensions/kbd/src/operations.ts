import { Editor, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { getCurrentTextNode } from "@tau/editor/api";
export const unwrapKbd = (editor: Editor) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  Transforms.unwrapNodes(editor, {
    match: n => n.type === "kbd",
  });
};

export const wrapKbd = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection) || ReactEditor.isReadOnly(editor)) return;
  const node = getCurrentTextNode(editor)?.[0];
  if (node?.type === "formatted") {
    const text = Editor.string(editor, selection);
    editor.deleteBackward("character");
    Transforms.wrapNodes(
      editor,
      {
        type: "kbd",
        children: [{ type: "formatted", text }],
      },
      {
        at: selection,
        split: true,
      }
    );
  }
};
