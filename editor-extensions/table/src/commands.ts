import { Editor, Range } from "slate";

import type { EditorCommand, EditorHotkey } from "@tau/editor/api";
import {
  deleteNextCol,
  deleteNextRow,
  deletePrevCol,
  deletePrevRow,
  insertColLeft,
  insertColRight,
  insertRowAfter,
  insertRowBefore,
  moveNextCol,
  moveNextRow,
  movePrevCol,
  movePrevRow,
} from "./utils";

/** 光标是否在表格单元格内（表格热键的公共前提） */
const inTableCell = (editor: Editor) => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const [match] = Editor.nodes(editor, {
    match: n => n.type === "table-cell",
  });
  return !!match;
};

/** 定义一个「单元格内才生效」的表格命令：action 为单元格内的实际动作 */
const tableCommand = (
  id: string,
  title: string,
  run: (editor: Editor) => void,
  stopPropagation = false
): EditorCommand => ({
  id,
  title,
  run: (editor, ctx) => {
    if (!inTableCell(editor)) return;
    run(editor);
    ctx.event?.preventDefault();
    if (stopPropagation) ctx.event?.stopPropagation();
  },
});

export const tableCommands: EditorCommand[] = [
  tableCommand("tau.table.next-cell", "下一单元格", moveNextCol),
  tableCommand("tau.table.prev-cell", "上一单元格", movePrevCol),
  tableCommand("tau.table.next-row", "下一行", moveNextRow),
  tableCommand("tau.table.prev-row", "上一行", movePrevRow),
  tableCommand("tau.table.insert-col-right", "右侧插入列", insertColRight, true),
  tableCommand("tau.table.insert-col-left", "左侧插入列", insertColLeft, true),
  tableCommand("tau.table.insert-row-before", "上方插入行", insertRowBefore),
  tableCommand("tau.table.insert-row-after", "下方插入行", insertRowAfter),
  tableCommand("tau.table.delete-col-right", "删除右侧列", deleteNextCol),
  tableCommand("tau.table.delete-col-left", "删除左侧列", deletePrevCol),
  tableCommand("tau.table.delete-row-above", "删除上方行", deletePrevRow),
  tableCommand("tau.table.delete-row-below", "删除下方行", deleteNextRow),
];

export const tableHotkeys: EditorHotkey[] = [
  { key: "tab", command: "tau.table.next-cell" },
  { key: "shift+tab", command: "tau.table.prev-cell" },
  { key: ["enter", "ArrowDown"], command: "tau.table.next-row" },
  { key: "ArrowUp", command: "tau.table.prev-row" },
  { key: "mod+ArrowRight", command: "tau.table.insert-col-right" },
  { key: "mod+ArrowLeft", command: "tau.table.insert-col-left" },
  { key: "mod+ArrowUp", command: "tau.table.insert-row-before" },
  { key: "mod+ArrowDown", command: "tau.table.insert-row-after" },
  { key: "mod+shift+ArrowRight", command: "tau.table.delete-col-right" },
  { key: "mod+shift+ArrowLeft", command: "tau.table.delete-col-left" },
  { key: "mod+shift+ArrowUp", command: "tau.table.delete-row-above" },
  { key: "mod+shift+ArrowDown", command: "tau.table.delete-row-below" },
];
