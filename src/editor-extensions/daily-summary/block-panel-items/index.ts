import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertDailySummary } from "../utils.ts";

const items: IBlockPanelListItem[] = [
  {
    icon: "document-card-list",
    title: "今日总结",
    keywords: ["今日总结", "daily-summary", "jinrizongjie"],
    description: "今日总结",
    onClick: (editor) => {
      insertDailySummary(editor);
    },
  },
];

export default items;
