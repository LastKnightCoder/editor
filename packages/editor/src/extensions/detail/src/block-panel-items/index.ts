import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { ChevronDown } from "lucide-react";
import { IBlockPanelListItem } from "../types";
import { insertDetails } from "../operations";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: ChevronDown,
      get title() {
        return editorT(editor, "block.detail");
      },
      keywords: [...["detail", "详情块", "xiangqingkuai"], ...editorAliases("block.detail")],
      get description() {
        return editorT(editor, "block.detail");
      },
      onClick: editor => {
        insertDetails(editor);
      },
    },
  ];

  return items;
};
export default getItems;
