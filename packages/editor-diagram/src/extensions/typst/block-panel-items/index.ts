import { PenTool } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertTypst } from "../../../insert";

const items: IBlockPanelListItem[] = [
  {
    icon: PenTool,
    title: "Typst",
    keywords: ["typst", "math", "typeset"],
    description: "Typst",
    onClick: editor => {
      insertTypst(editor);
    },
  },
];

export default items;
