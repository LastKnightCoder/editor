import {IBlockPanelListItem} from "@/components/Editor/types";
import {insertTable} from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'table',
  title: '表格',
  keywords: ['table', '表格'],
  description: '表格',
  onClick: (editor) => {
    insertTable(editor, 3, 3);
  }
}]

export default items;
