import { Editor } from "slate";
import { setOrInsertNode } from "../../utils";
import { WebviewElement } from "../../types";
import { WebLinkSourceType } from "@/types";

interface InsertWebviewPayload {
  url: string;
  sourceType?: WebLinkSourceType;
}

export const insertWebview = (
  editor: Editor,
  payload: InsertWebviewPayload,
) => {
  const { url, sourceType = "remote" } = payload;
  const webview: WebviewElement = {
    type: "webview",
    url,
    height: 400,
    sourceType,
    children: [{ type: "formatted", text: "" }],
  };
  setOrInsertNode(editor, webview);
};
