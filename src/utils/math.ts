import {Editor, Transforms} from "slate";

export const insertBlockMath = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'block-math',
    tex: 'f(x)',
    children: [{
      type: 'formatted',
      text: ''
    }]
  });
}