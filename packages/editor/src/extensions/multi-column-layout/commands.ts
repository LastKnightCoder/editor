import { Editor, Range } from "slate";

import type { EditorCommand, EditorHotkey } from "../../api";
import {
  deleteColumnLeft,
  deleteColumnRight,
  insertColumnLeft,
  insertColumnRight,
} from "../../utils";

/** 光标是否在列内（多列热键的公共前提） */
const inColumn = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const [match] = Editor.nodes(editor, {
    match: n => n.type === "multi-column-item",
  });
  return !!match;
};

const columnCommand = (
  id: string,
  title: string,
  run: (editor: Editor) => void
): EditorCommand => ({
  id,
  title,
  run: (editor, ctx) => {
    if (!inColumn(editor)) return;
    run(editor);
    ctx.event?.preventDefault();
    ctx.event?.stopPropagation();
  },
});

export const multiColumnCommands: EditorCommand[] = [
  columnCommand("tau.multi-column.insert-right", "右侧插入列", insertColumnRight),
  columnCommand("tau.multi-column.insert-left", "左侧插入列", insertColumnLeft),
  columnCommand("tau.multi-column.delete-right", "删除右侧列", deleteColumnRight),
  columnCommand("tau.multi-column.delete-left", "删除左侧列", deleteColumnLeft),
];

export const multiColumnHotkeys: EditorHotkey[] = [
  { key: "mod+ArrowRight", command: "tau.multi-column.insert-right" },
  { key: "mod+ArrowLeft", command: "tau.multi-column.insert-left" },
  { key: "mod+shift+ArrowRight", command: "tau.multi-column.delete-right" },
  { key: "mod+shift+ArrowLeft", command: "tau.multi-column.delete-left" },
];
