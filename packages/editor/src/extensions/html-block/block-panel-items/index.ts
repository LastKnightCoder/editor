import { FileCode, Code } from "lucide-react";
import { Editor } from "slate";
import { IBlockPanelListItem } from "../../../types";
import { insertHTMLBlock } from "../../../utils";
import { insertInlineHtmlElement } from "../utils/insertElement";

const htmlChildren: IBlockPanelListItem[] = [
  {
    icon: FileCode,
    title: "块级HTML",
    keywords: ["html-block", "HTML块", "kuaiji"],
    description: "块级HTML",
    onClick: (editor: Editor) => {
      insertHTMLBlock(editor);
    },
  },
  {
    icon: Code,
    title: "行内HTML",
    keywords: ["html-inline", "行内HTML", "hangnei"],
    description: "插入行内HTML片段",
    onClick: (editor: Editor) => {
      insertInlineHtmlElement(editor);
    },
  },
];

const items: IBlockPanelListItem[] = [
  {
    icon: FileCode,
    title: "HTML",
    keywords: ["HTML", "html", "html-block", "html-inline", "块级", "行内"],
    description: "插入HTML代码",
    children: htmlChildren,
  },
];

export default items;
