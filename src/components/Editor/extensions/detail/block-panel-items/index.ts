import { ChevronDown } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertDetails } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: ChevronDown,
    title: "详情块",
    keywords: ["detail", "详情块", "xiangqingkuai"],
    description: "详情块",
    onClick: (editor) => {
      insertDetails(editor);
    },
  },
];

export default items;
