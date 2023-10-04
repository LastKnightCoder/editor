import {IBlockPanelListItem} from "@/components/Editor/types";
import {insertGraphviz} from "@/components/Editor/utils";

const items: IBlockPanelListItem[] = [{
  icon: 'graphviz',
  title: 'Graphviz',
  keywords: ['graphviz', 'Graphviz'],
  description: 'Graphviz',
  onClick: (editor) => {
    insertGraphviz(editor);
  }
}]

export default items;