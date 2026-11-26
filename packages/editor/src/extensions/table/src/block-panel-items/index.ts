import { editorT, editorAliases } from "../../../../i18n-runtime";
import type { Editor as LocaleEditor } from "slate";
import { Table } from "lucide-react";
import { IBlockPanelListItem } from "../types";
import { insertTable } from "../insertTable";

const getItems = (editor: LocaleEditor): IBlockPanelListItem[] => {
  const items: IBlockPanelListItem[] = [
    {
      icon: Table,
      get title() {
        return editorT(editor, "block.table");
      },
      keywords: [...["table", "表格", "biaoge"], ...editorAliases("block.table")],
      get description() {
        return editorT(editor, "block.table");
      },
      onClick: editor => {
        insertTable(editor, 3, 3);
      },
    },
  ];

  return items;
};
export default getItems;
