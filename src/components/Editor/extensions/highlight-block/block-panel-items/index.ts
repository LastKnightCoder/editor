import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertHighlightBlock } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'highlight-block',
  title: '高亮块',
  keywords: ['highlight', '高亮块'],
  description: '高亮块',
  onClick: (editor) => {
    insertHighlightBlock(editor, 'red');
  }
}]

export default items;