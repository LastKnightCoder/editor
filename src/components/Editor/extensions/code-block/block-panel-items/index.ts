import { Code2 } from "lucide-react";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertCodeBlock } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Code2,
    title: "代码块",
    keywords: ["codeblock", "代码块", "daimakuai"],
    description: "代码块",
    onClick: (editor) => {
      insertCodeBlock(editor);
    },
  },
];

export default items;
