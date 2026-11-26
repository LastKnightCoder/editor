import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Minus } from "lucide-react";
import { IBlockPanelListItem } from "@tau/editor/api";
import { insertDivideLine } from "../operations.ts";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Minus,
      get title() {
        return editorT(editor, "block.divider");
      },
      keywords: [...["divide-line", "分割线", "fengexian"], ...editorAliases("block.divider")],
      get description() {
        return editorT(editor, "block.divider");
      },
      onClick: editor => {
        insertDivideLine(editor);
      },
    },
  ];

  return items;
};
export default getItems;
