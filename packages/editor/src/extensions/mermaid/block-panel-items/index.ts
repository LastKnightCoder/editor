import { GitBranch } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertMermaid } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: GitBranch,
    title: "流程图",
    keywords: ["mermaid", "流程图"],
    description: "流程图",
    onClick: (editor) => {
      insertMermaid(editor);
    },
  },
];

export default items;
