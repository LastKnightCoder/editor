import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { wrapInlineText } from "@tau/editor/api";
import { EStyledColor } from "./colors";
import { STYLED_TEXT_SELECT_COLOR_KEY } from "./state";
export const unwrapStyledText = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  Transforms.unwrapNodes(editor, {
    match: n => n.type === "styled-text",
  });
};

export const wrapStyledText = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  wrapInlineText(editor, () => ({
    type: "styled-text",
    color: (localStorage.getItem(STYLED_TEXT_SELECT_COLOR_KEY) as EStyledColor) || EStyledColor.Red,
    children: [],
  }));
};
