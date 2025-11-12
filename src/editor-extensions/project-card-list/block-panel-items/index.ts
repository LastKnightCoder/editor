import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertProjectCardList } from "../utils.ts";

const createBlockPanelItems = (projectId?: number): IBlockPanelListItem[] => {
  return [
    {
      icon: "document-card-list",
      title: "项目列表",
      keywords: ["项目列表", "project-card-list", "xiangmu"],
      description: "项目列表",
      onClick: (editor) => {
        insertProjectCardList(editor, projectId);
      },
    },
  ];
};

export default createBlockPanelItems;
