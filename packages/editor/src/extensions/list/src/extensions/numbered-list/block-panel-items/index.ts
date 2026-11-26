import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { ListOrdered } from "lucide-react";
import { insertNumberedList } from "../../../utils";
import { IBlockPanelListItem } from "../../../types";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: ListOrdered,
      get title() {
        return editorT(editor, "block.numbered");
      },
      keywords: [...["numbered-list", "列表", "liebiao", "ol"], ...editorAliases("block.numbered")],
      get description() {
        return editorT(editor, "block.numbered");
      },
      onClick: editor => {
        insertNumberedList(editor);
      },
    },
  ];

  return items;
};
export default getItems;
