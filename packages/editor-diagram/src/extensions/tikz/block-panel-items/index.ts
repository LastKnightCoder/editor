import { PenTool } from "lucide-react";
import type { IBlockPanelListItem } from "@tau/editor/api";
import { insertTikz } from "../../../insert";

const items: IBlockPanelListItem[] = [
  {
    icon: PenTool,
    title: "TikZ",
    keywords: ["tikz", "TikZ", "huitu"],
    description: "TikZ",
    onClick: editor => {
      insertTikz(editor);
    },
  },
];

export default items;
