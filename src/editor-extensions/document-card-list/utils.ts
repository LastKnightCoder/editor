import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import { message } from "antd";

export const insertDocumentCardList = (editor: Editor, documentId?: number) => {
  if (!documentId) {
    message.warning("无法获取到当前文档 ID");
    return;
  }

  return setOrInsertNode(editor, {
    // @ts-ignore
    type: "document-card-list",
    documentItemId: documentId,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  });
};
