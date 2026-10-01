import { Editor, Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { getCurrentTextNode } from "@tau/editor/api";
import { EStyledColor } from "./colors";
import { STYLED_TEXT_SELECT_COLOR_KEY } from "./state";
export const unwrapStyledText = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  Transforms.unwrapNodes(editor, {
    match: n => n.type === "styled-text",
  });
};

export const wrapStyledText = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || Range.isCollapsed(selection) || ReactEditor.isReadOnly(editor)) return;
  const node = getCurrentTextNode(editor)?.[0];
  if (node?.type === "formatted") {
    const text = Editor.string(editor, selection);
    editor.deleteBackward("character");
    Transforms.wrapNodes(
      editor,
      {
        type: "styled-text",
        color:
          (localStorage.getItem(STYLED_TEXT_SELECT_COLOR_KEY) as EStyledColor) || EStyledColor.Red,
        children: [{ type: "formatted", text }],
      },
      {
        at: selection,
        split: true,
      }
    );
  }
};
