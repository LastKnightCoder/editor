import { insertNumberedList } from "@/components/Editor/utils";
import { IBlockPanelListItem } from "@/components/Editor/types";

const items: IBlockPanelListItem[] = [{
  icon: 'numbered-list',
  title: '有序列表',
  keywords: ['numbered-list', '列表'],
  description: '有序列表',
  onClick: (editor) => {
    insertNumberedList(editor);
  }
}]

export default items;