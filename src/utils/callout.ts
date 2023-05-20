import { Editor, Transforms } from 'slate';
import {ReactEditor} from "slate-react";

export const insertCallout = (editor: Editor, type: 'tip' | 'warning' | 'info' | 'danger' | 'note') => {
  Transforms.insertNodes(editor, {
    type: 'callout',
    calloutType: type,
    children: [{
        type: 'paragraph',
        children: [{
          type: 'formatted',
          text: '',
        }]
      }],
  });
  const [callout] = Editor.nodes(editor, {
    match: n => n.type === 'callout',
  });
  if (!callout) {
    return;
  }

  setTimeout(() => {
    ReactEditor.focus(editor);
    Transforms.select(editor, [...callout[1], 0, 0])
  }, 200)
}

