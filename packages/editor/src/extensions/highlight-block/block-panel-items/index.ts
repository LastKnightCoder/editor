import { Highlighter } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertHighlightBlock } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Highlighter,
    title: "高亮块",
    keywords: ["highlight", "高亮块", "gaoliangkuai"],
    description: "高亮块",
    onClick: (editor) => {
      insertHighlightBlock(editor, "red");
    },
  },
];

export default items;
