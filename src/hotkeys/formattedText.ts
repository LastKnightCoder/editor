import { getCurrentTextNode } from "../utils";
import {Editor, Range} from "slate";
import { FormattedText } from "../custom-types";

import { Mark, HotKeyConfig } from "./types";

const markAction = (mark: Mark) => {
  return (editor: Editor) => {
    const node = getCurrentTextNode(editor)[0];
    if (node && node.type === 'formatted') {
      const marks = Editor.marks(editor);
      if (marks && (marks as FormattedText)[mark]) {
        Editor.removeMark(editor, mark);
      } else {
        Editor.addMark(editor, mark, true);
      }
    }
  }
}

export const formattedText: HotKeyConfig[] = [{
  hotKey: 'mod+shift+b',
  action: markAction('bold')
}, {
  hotKey: 'mod+i',
  action: markAction('italic')
}, {
  hotKey: 'mod+u',
  action: markAction('underline')
}, {
  hotKey: 'mod+shift+h',
  action: markAction('highlight')
}, {
  hotKey: 'mod+e',
  action: markAction('code')
}];

export const quitFormattedMarks: HotKeyConfig[] = [{
  hotKey: 'escape',
  action: (editor: Editor) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'formatted',
      })
      if (match) {
        ['bold', 'italic', 'underline', 'highlight', 'code'].forEach((type) => {
          Editor.removeMark(editor, type);
        });
      }
    }
  }
}]