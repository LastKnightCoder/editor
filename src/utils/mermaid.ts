import {Editor, Transforms} from "slate";

export const insertMermaid = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'mermaid',
    chart: '',
    children: [{
      type: 'formatted',
      text: '',
    }]
  });
}
