import {IBlockPanelListItem} from "@/components/Editor/types";
import {insertDetails} from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'detail',
  title: '详情块',
  keywords: ['detail', '详情块'],
  description: '详情块',
  onClick: (editor) => {
    insertDetails(editor);
  }
}]

export default items;