import { Code2 } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertCodeBlock } from "../../../insert";

const items: IBlockPanelListItem[] = [
  {
    icon: Code2,
    title: "代码块",
    keywords: ["codeblock", "代码块", "daimakuai"],
    description: "代码块",
    onClick: editor => {
      insertCodeBlock(editor);
    },
  },
];

export default items;
