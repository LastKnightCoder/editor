import { Range, Editor } from "slate";
import {HotKeyConfig} from "./types";
import {
  insertColLeft,
  insertColRight,
  insertRowAfter,
  insertRowBefore,
  moveNextCol,
  moveNextRow,
  movePrevCol,
  movePrevRow
} from "../utils";

export const tableConfig: HotKeyConfig[] = [{
  hotKey: 'tab',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      moveNextCol(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'shift+tab',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      movePrevCol(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: ['enter', 'down'],
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      moveNextRow(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: ['shift+enter', 'up'],
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      movePrevRow(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'mod+right',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      insertColRight(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'mod+left',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      insertColLeft(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'mod+up',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      insertRowBefore(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'mod+down',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      insertRowAfter(editor);
      event.preventDefault();
    }
  }
}]