import { PenTool } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertTypst } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: PenTool,
    title: "Typst",
    keywords: ["typst", "math", "typeset"],
    description: "Typst",
    onClick: (editor) => {
      insertTypst(editor);
    },
  },
];

export default items;
