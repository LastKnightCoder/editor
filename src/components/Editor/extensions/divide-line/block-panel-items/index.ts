import {IBlockPanelListItem} from "@/components/Editor/types";
import {insertDivideLine} from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'divide-line',
  title: '分割线',
  keywords: ['divide-line', '分割线'],
  description: '分割线',
  onClick: (editor) => {
    insertDivideLine(editor);
  }
}]

export default items;