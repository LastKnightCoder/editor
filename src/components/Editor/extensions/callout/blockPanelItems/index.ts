import { insertCallout } from "@/components/Editor/utils";
import { IBlockPanelListItem } from "@/components/Editor/types";


const items: IBlockPanelListItem[] = [{
  icon: 'callout',
  title: '提示',
  keywords: ['callout', '提示', 'tip'],
  description: '提示',
  onClick: (editor) => {
    insertCallout(editor, 'tip');
  }
}, {
  icon: 'callout',
  title: '信息',
  keywords: ['callout', '信息', 'info'],
  description: '信息',
  onClick: (editor) => {
    insertCallout(editor, 'info');
  }
}, {
  icon: 'callout',
  title: '笔记',
  keywords: ['callout', '笔记', 'note'],
  description: '笔记',
  onClick: (editor) => {
    insertCallout(editor, 'note');
  }
}, {
  icon: 'callout',
  title: '危险',
  keywords: ['callout', '危险', 'danger'],
  description: '危险',
  onClick: (editor) => {
    insertCallout(editor, 'danger');
  }
}, {
  icon: 'callout',
  title: '警告',
  keywords: ['callout', '警告', 'warning'],
  description: '警告',
  onClick: (editor) => {
    insertCallout(editor, 'warning');
  }
}];

export default items;