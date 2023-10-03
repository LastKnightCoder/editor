import {HotKeyConfig} from "@/components/Editor/hotkeys/types.ts";
import {Editor, Range} from "slate";
import {
  moveNextCol,
  moveNextRow,
  movePrevCol,
  movePrevRow
} from "@/components/Editor/utils";

const navigate: HotKeyConfig[] = [{
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
}]

export default navigate;