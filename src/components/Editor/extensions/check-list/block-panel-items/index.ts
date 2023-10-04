import {IBlockPanelListItem} from "@/components/Editor/types";
import {insertCheckList} from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'check-list',
  title: '任务列表',
  keywords: ['check-list', '列表'],
  description: '任务列表',
  onClick: (editor) => {
    insertCheckList(editor);
  }
}];

export default items;