import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertDocumentCardList } from "../utils.ts";

const items: IBlockPanelListItem[] = [
  {
    icon: "document-card-list",
    title: "文档列表",
    keywords: ["文档列表", "document-card-list", "wendang"],
    description: "文档列表",
    onClick: (editor) => {
      insertDocumentCardList(editor);
    },
  },
];

export default items;
