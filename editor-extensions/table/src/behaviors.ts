import { Editor, Element as SlateElement, Range, Transforms } from "slate";

import type { ElementBehaviors } from "@tau/editor/api";
import type { ParagraphElement, TableCellElement } from "./types";
import { isAtParagraphStart, isParagraphAndEmpty, movePrevCol } from "./utils";

/** 单元格内回车不拆行（表格内的换行语义交给单元格导航热键） */
const insertBreak: ElementBehaviors<TableCellElement>["insertBreak"] = editor => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const [match] = Editor.nodes(editor, {
    match: n => n.type === "table-cell",
  });
  return !!match;
};

/** 单元格内首个文本开头退格：移到前一列末尾，不把内容并出单元格 */
const deleteBackward: ElementBehaviors<TableCellElement>["deleteBackward"] = editor => {
  const { selection } = editor;
  if (!selection || !Range.isCollapsed(selection)) return false;
  const [text] = Editor.nodes(editor, {
    match: n => n.type === "formatted",
  });
  if (!text) return false;
  const [, path] = text;
  if (path[path.length - 1] === 0 && Editor.isStart(editor, selection.anchor, path)) {
    movePrevCol(editor);
    return true;
  }
  return false;
};

export const tableCellBehaviors: ElementBehaviors<TableCellElement> = {
  insertBreak,
  deleteBackward,
};

/** 表格下方段落的段首退格：空段落删掉、光标移进表格最后一行（知识属于 table，挂在 paragraph 上） */
const blockAfterTable: ElementBehaviors<ParagraphElement>["deleteBackward"] = (
  editor,
  [, path]
) => {
  if (!isAtParagraphStart(editor)) return false;
  // 单元格内的段首退格归 table-cell 自己的行为（旧插件里 cell 分支在前；分发后 paragraph
  // 层先试，这里必须让路——否则下面按祖先链找 table 会误命中单元格内的段落）
  const [inCell] = Editor.nodes(editor, {
    match: n => n.type === "table-cell",
  });
  if (inCell) return false;
  const prevPath = Editor.before(editor, path);
  if (!prevPath) return false;
  const [prevMatch] = Editor.nodes(editor, {
    at: prevPath,
    match: n => SlateElement.isElement(n) && n.type === "table",
  });
  if (!prevMatch) return false;
  if (isParagraphAndEmpty(editor)) {
    Transforms.removeNodes(editor, { at: path });
  }
  Transforms.move(editor, { distance: -1, unit: "line" });
  return true;
};

export const tableForParagraph: ElementBehaviors<ParagraphElement> = {
  deleteBackward: blockAfterTable,
};
