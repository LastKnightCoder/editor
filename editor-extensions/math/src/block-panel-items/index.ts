import { Sigma } from "lucide-react";
import { insertBlockMath } from "../insert";
import type { IBlockPanelListItem } from "@tau/editor/api";

const items: IBlockPanelListItem[] = [
  {
    icon: Sigma,
    title: "数学公式",
    keywords: ["math", "数学公式", "latex", "katex", "shuxue"],
    description: "数学公式",
    onClick: editor => {
      insertBlockMath(editor);
    },
  },
];

export default items;
