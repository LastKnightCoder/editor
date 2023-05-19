import {Editor, Transforms} from "slate";

export const insertBulletList = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'bulleted-list',
    children: [{
        type: 'list-item',
        children: [{
            type: 'paragraph',
            children: [{
                text: '',
                type: 'formatted'
              }]
          }]
      }]
  });
}

export const insertNumberedList = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'numbered-list',
    children: [{
        type: 'list-item',
        children: [{
            type: 'paragraph',
            children: [{
                text: '',
                type: 'formatted'
              }]
          }]
      }]
  });
}

export const insertCheckList = (editor: Editor) => {
  Transforms.insertNodes(editor, {
    type: 'check-list',
    checked: false,
    children: [{
        type: 'check-list-item',
      checked: false,
        children: [{
            type: 'paragraph',
            children: [{
                text: '',
                type: 'formatted'
              }]
          }]
      }]
  });
}
