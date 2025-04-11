import { Editor } from "slate";
import { setOrInsertNode } from "../../utils";
import { WebviewElement } from "../../types";

export const insertWebview = (editor: Editor, url: string) => {
  const webview: WebviewElement = {
    type: "webview",
    url,
    height: 400,
    children: [{ type: "formatted", text: "" }],
  };
  setOrInsertNode(editor, webview);
};
