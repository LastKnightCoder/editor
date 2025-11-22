import { Editor } from "slate";
import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertInlineHtmlElement } from "@/components/Editor/utils/insertElement";

const items: IBlockPanelListItem[] = [
  {
    icon: "code",
    title: "行内HTML",
    keywords: ["html-inline", "行内HTML"],
    description: "插入行内HTML片段",
    onClick: (editor: Editor) => {
      insertInlineHtmlElement(editor, "", true);
    },
  },
];

export default items;
