import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Layers } from "lucide-react";
import { IBlockPanelListItem } from "../types";
import { insertTabs } from "../operations";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Layers,
      get title() {
        return editorT(editor, "block.tabs");
      },
      keywords: [...["tabs", "Tabs", "标签页", "biaoqianye"], ...editorAliases("block.tabs")],
      get description() {
        return editorT(editor, "block.tabs");
      },
      onClick: editor => {
        insertTabs(editor);
      },
    },
  ];

  return items;
};
export default getItems;
