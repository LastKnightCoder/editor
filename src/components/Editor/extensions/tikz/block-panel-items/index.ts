import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertTikz } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'tikz',
  title: 'TikZ',
  keywords: ['tikz', 'TikZ'],
  description: 'TikZ',
  onClick: (editor) => {
    insertTikz(editor);
  }
}]

export default items;