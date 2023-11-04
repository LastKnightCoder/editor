import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertMultiColumnsContainer } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'columns',
  title: '多列布局',
  keywords: ['columns', '多列', '布局'],
  description: '多列',
  onClick: (editor) => {
    insertMultiColumnsContainer(editor, 2);
  }
}]

export default items;