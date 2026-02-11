import { Editor } from "slate";
import { setOrInsertNode } from "@tau/editor/src";
import { message } from "antd";
import type { DocumentCardListElement } from "./types";

export const insertDocumentCardList = (editor: Editor, documentId?: number) => {
  if (!documentId) {
    message.warning("无法获取到当前文档 ID");
    return;
  }

  const documentCardListNode: DocumentCardListElement = {
    type: "document-card-list",
    documentItemId: documentId,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  };

  return setOrInsertNode(editor, documentCardListNode);
};
