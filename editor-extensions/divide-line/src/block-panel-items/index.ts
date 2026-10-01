import { Minus } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/api";
import { insertDivideLine } from "../operations.ts";

const items: IBlockPanelListItem[] = [
  {
    icon: Minus,
    title: "分割线",
    keywords: ["divide-line", "分割线", "fengexian"],
    description: "分割线",
    onClick: editor => {
      insertDivideLine(editor);
    },
  },
];

export default items;
