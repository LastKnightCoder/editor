import {IBlockPanelListItem} from "../types/blockPanel.ts";
import {insertHeader} from "@/pages/Editor/utils";

export const blockPanelList: IBlockPanelListItem[] = [{
  icon: 'h1',
  title: '一级标题',
  keywords: ['h1', '一级标题'],
  description: '一级标题',
  onClick: (editor) => {
    insertHeader(editor, 1);
  }
}, {
  icon: 'h2',
  title: '二级标题',
  keywords: ['h2', '二级标题'],
  description: '二级标题',
  onClick: (editor) => {
    insertHeader(editor, 2);
  }
}];