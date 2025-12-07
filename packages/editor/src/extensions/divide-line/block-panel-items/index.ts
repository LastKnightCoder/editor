import { Minus } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertDivideLine } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Minus,
    title: "分割线",
    keywords: ["divide-line", "分割线", "fengexian"],
    description: "分割线",
    onClick: (editor) => {
      insertDivideLine(editor);
    },
  },
];

export default items;
