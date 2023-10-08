import { Editor, Range } from "slate";
import { deletePrevRow, deleteNextRow, deletePrevCol, deleteNextCol } from "@/components/Editor/utils";

import { HotKeyConfig } from "@/components/Editor/hotkeys/types.ts";

const deleteTable: HotKeyConfig[] = [{
  hotKey: 'mod+shift+right',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      deleteNextCol(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'mod+shift+left',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      deletePrevCol(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'mod+shift+up',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      deletePrevRow(editor);
      event.preventDefault();
    }
  }
}, {
  hotKey: 'mod+shift+down',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'table-cell',
      });
      if (!match) {
        return;
      }
      deleteNextRow(editor);
      event.preventDefault();
    }
  }
}]

export default deleteTable;