import { Editor } from "slate";
import { setOrInsertNode } from "@/components/Editor/utils";
import useDocumentsStore from "@/stores/useDocumentsStore.ts";
import { message } from "antd";

export const insertDocumentCardList = (editor: Editor) => {
  const activeDocumentItemId =
    useDocumentsStore.getState().activeDocumentItemId;
  if (!activeDocumentItemId) {
    message.warning("无法获取到当前文档或者当前文档无子项");
    return;
  }

  return setOrInsertNode(editor, {
    // @ts-ignore
    type: "document-card-list",
    documentItemId: activeDocumentItemId,
    children: [
      {
        type: "formatted",
        text: "",
      },
    ],
  });
};
