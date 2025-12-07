import { Network } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertGraphviz } from "../../../utils";

const items: IBlockPanelListItem[] = [
  {
    icon: Network,
    title: "Graphviz",
    keywords: ["graphviz", "Graphviz"],
    description: "Graphviz",
    onClick: (editor) => {
      insertGraphviz(editor);
    },
  },
];

export default items;
