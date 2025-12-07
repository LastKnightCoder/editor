import { PenTool } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertTikz } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: PenTool,
    title: "TikZ",
    keywords: ["tikz", "TikZ", "huitu"],
    description: "TikZ",
    onClick: (editor) => {
      insertTikz(editor);
    },
  },
];

export default items;
