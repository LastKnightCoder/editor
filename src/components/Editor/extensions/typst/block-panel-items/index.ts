import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertTypst } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "tikz",
    title: "Typst",
    keywords: ["typst", "math", "typeset"],
    description: "Typst",
    onClick: (editor) => {
      insertTypst(editor);
    },
  },
];

export default items;
