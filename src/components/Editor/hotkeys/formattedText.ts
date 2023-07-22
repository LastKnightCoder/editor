import { getCurrentTextNode } from "../utils";
import {Editor, Range, Transforms} from "slate";
import { FormattedText } from "../types";

import { Mark, HotKeyConfig } from "./types";
import React from "react";

const markAction = (mark: Mark) => {
  return (editor: Editor, event: React.KeyboardEvent<HTMLDivElement>) => {
    const node = getCurrentTextNode(editor)[0];
    if (node && node.type === 'formatted') {
      const marks = Editor.marks(editor);
      if (marks && (marks as FormattedText)[mark]) {
        Editor.removeMark(editor, mark);
      } else {
        Editor.addMark(editor, mark, true);
      }
      const { selection } = editor;
      if (selection && !Range.isCollapsed(selection)) {
        Transforms.collapse(editor, { edge: 'end' });
        Editor.removeMark(editor, mark);
      }
      event.preventDefault();
      event.stopPropagation();
    }
  }
}

export const formattedText: HotKeyConfig[] = [{
  hotKey: 'mod+b',
  action: markAction('bold')
}, {
  hotKey: 'mod+i',
  action: markAction('italic')
}, {
  hotKey: 'mod+u',
  action: markAction('underline')
}, {
  hotKey: 'mod+shift+s',
  action: markAction('strikethrough')
},{
  hotKey: 'mod+m',
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
        ['bold', 'italic', 'underline', 'highlight', 'code', 'strikethrough'].forEach((type) => {
          Editor.removeMark(editor, type);
        });
      }
    }
  }
}]