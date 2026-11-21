import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { wrapInlineText } from "@tau/editor/api";
export const unwrapUnderline = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  Transforms.unwrapNodes(editor, {
    match: n => n.type === "underline",
  });
};

export const wrapUnderline = (editor: Editor) => {
  if (ReactEditor.isReadOnly(editor)) return;
  wrapInlineText(editor, () => ({
    type: "underline",
    color: localStorage.getItem("underline-color") || "red",
    lineType: localStorage.getItem("underline-line-type") || "solid",
    colorSelectOpen: false,
    children: [],
  }));
};
