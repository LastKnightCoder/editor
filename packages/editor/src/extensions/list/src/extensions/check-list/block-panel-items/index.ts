import { editorT, editorAliases } from "../../../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { ListChecks } from "lucide-react";
import { IBlockPanelListItem } from "../../../types";
import { insertCheckList } from "../../../utils";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: ListChecks,
      get title() {
        return editorT(editor, "block.todo");
      },
      keywords: [...["check-list", "列表", "todo"], ...editorAliases("block.todo")],
      get description() {
        return editorT(editor, "block.todo");
      },
      onClick: editor => {
        insertCheckList(editor);
      },
    },
  ];

  return items;
};
export default getItems;
