import { Editor, Transforms } from "slate";
import type { HTMLInlineElement } from "../../../types";

export function insertInlineHtmlElement(editor: Editor): void {
  const inlineHtml: HTMLInlineElement = {
    type: "html-inline",
    html: "",
    children: [{ type: "formatted", text: "" }],
  };

  Transforms.insertNodes(editor, inlineHtml);
}
