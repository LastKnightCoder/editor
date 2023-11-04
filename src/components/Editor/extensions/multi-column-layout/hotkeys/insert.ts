import { Editor, Range } from "slate";
import { insertColumnLeft, insertColumnRight } from "@/components/Editor/utils";
import { IHotKeyConfig } from "@/components/Editor/types";

const insert: IHotKeyConfig[] = [{
  hotKey: 'mod+right',
  action: (editor, event) => {
    const { selection } = editor;
    if (selection && Range.isCollapsed(selection)) {
      const [match] = Editor.nodes(editor, {
        match: n => n.type === 'multi-column-item',
      });
      if (!match) {
        return;
      }
      insertColumnRight(editor);
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
        match: n => n.type === 'multi-column-item',
      });
      if (!match) {
        return;
      }
      insertColumnLeft(editor);
      event.preventDefault();
      event.stopPropagation();
    }
  }
}]

export default insert;