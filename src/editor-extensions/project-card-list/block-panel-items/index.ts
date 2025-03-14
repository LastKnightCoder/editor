import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertProjectCardList } from "../utils.ts";

const items: IBlockPanelListItem[] = [
  {
    icon: "document-card-list",
    title: "文档列表",
    keywords: ["文档列表", "project-card-list", "wendang"],
    description: "文档列表",
    onClick: (editor) => {
      insertProjectCardList(editor);
    },
  },
];

export default items;
