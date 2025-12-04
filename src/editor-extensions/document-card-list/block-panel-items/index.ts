import { LayoutList } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertDocumentCardList } from "../utils.ts";

const createBlockPanelItems = (documentId?: number): IBlockPanelListItem[] => {
  return [
    {
      icon: LayoutList,
      title: "文档列表",
      keywords: ["文档列表", "document-card-list", "wendang"],
      description: "文档列表",
      onClick: (editor) => {
        insertDocumentCardList(editor, documentId);
      },
    },
  ];
};

export default createBlockPanelItems;
