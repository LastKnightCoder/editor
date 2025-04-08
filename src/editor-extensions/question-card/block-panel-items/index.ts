import { IBlockPanelListItem } from "@/components/Editor/types";
import { createQuestionNode } from "../utils";

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: "question-circle",
    keywords: ["问题", "question", "wenti"],
    title: "问题",
    description: "创建一个问题卡片",
    onClick: (editor) => {
      createQuestionNode(editor);
    },
  },
];

export default blockPanelItems;
