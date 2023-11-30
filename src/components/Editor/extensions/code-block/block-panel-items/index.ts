import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertCodeBlock } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'codeblock',
  title: '代码块',
  keywords: ['codeblock', '代码块', 'daimakuai'],
  description: '代码块',
  onClick: (editor) => {
    insertCodeBlock(editor);
  }
}]

export default items;