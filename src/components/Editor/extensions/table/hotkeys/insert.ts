import { Editor, Range } from "slate";
import { insertColLeft, insertColRight, insertRowAfter, insertRowBefore } from "@/components/Editor/utils";
import { IHotKeyConfig } from "@/components/Editor/types";

const insert: IHotKeyConfig[] = [{
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
      event.stopPropagation();
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
      event.stopPropagation();
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

export default insert;