import { ChevronDown } from "lucide-react";
import { IBlockPanelListItem } from "../types";
import { insertDetails } from "../operations";

const items: IBlockPanelListItem[] = [
  {
    icon: ChevronDown,
    title: "详情块",
    keywords: ["detail", "详情块", "xiangqingkuai"],
    description: "详情块",
    onClick: editor => {
      insertDetails(editor);
    },
  },
];

export default items;
