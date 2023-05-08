import { Editor, Range } from "slate";
import { HotKeyConfig } from "./types";
import { isLeafNode } from '../utils';

export const commonConfig: HotKeyConfig[] = [{
  hotKey: 'escape',
  action: (editor: Editor) => {
    const { selection } = editor;
    if (!selection || !Range.isCollapsed(selection)) {
      return;
    }
    console.log('::selection here');
    const [match] = Editor.nodes(editor, {
      match: n => isLeafNode(n)
    });
    if (match && Editor.isEnd(editor, selection.anchor, match[1])) {
      editor.escMode = true;
    }
  }
}]