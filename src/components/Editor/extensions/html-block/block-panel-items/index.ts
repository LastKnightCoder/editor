import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertHTMLBlock } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "html",
    title: "html",
    keywords: ["html", "HTML"],
    description: "html",
    onClick: (editor) => {
      insertHTMLBlock(editor);
    },
  },
];

export default items;
