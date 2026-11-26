import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Highlighter } from "lucide-react";
import { IBlockPanelListItem } from "../types";
import { insertHighlightBlock } from "../operations";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Highlighter,
      get title() {
        return editorT(editor, "block.highlight");
      },
      keywords: [...["highlight", "高亮块", "gaoliangkuai"], ...editorAliases("block.highlight")],
      get description() {
        return editorT(editor, "block.highlight");
      },
      onClick: editor => {
        insertHighlightBlock(editor, "red");
      },
    },
  ];

  return items;
};
export default getItems;
