import { HelpCircle } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { createQuestionNode } from "../utils";

const blockPanelItems: IBlockPanelListItem[] = [
  {
    icon: HelpCircle,
    keywords: ["问题", "question", "wenti"],
    title: "问题",
    description: "创建一个问题卡片",
    onClick: (editor) => {
      createQuestionNode(editor);
    },
  },
];

export default blockPanelItems;
