import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertHTMLBlock } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [
  {
    icon: "html",
    title: "块级HTML",
    keywords: ["HTML", "html-block", "HTML块"],
    description: "块级HTML",
    onClick: (editor) => {
      insertHTMLBlock(editor);
    },
  },
];

export default items;
