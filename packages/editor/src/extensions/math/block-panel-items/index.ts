import { Sigma } from "lucide-react";
import { insertBlockMath } from "../../../utils";
import { IBlockPanelListItem } from "../../../types";

const items: IBlockPanelListItem[] = [
  {
    icon: Sigma,
    title: "数学公式",
    keywords: ["math", "数学公式", "latex", "katex", "shuxue"],
    description: "数学公式",
    onClick: (editor) => {
      insertBlockMath(editor);
    },
  },
];

export default items;
