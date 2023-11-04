import { IBlockPanelListItem } from "@/components/Editor/types";
import { insertMermaid } from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'mermaid',
  title: '流程图',
  keywords: ['mermaid', '流程图'],
  description: '流程图',
  onClick: (editor) => {
    insertMermaid(editor);
  }
}]

export default items;
