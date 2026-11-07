import { Editor, Element as SlateElement, Node, Path, Text, Transforms } from "slate";
import type { ElementBehaviors } from "@tau/editor/api";
import { createParagraph } from "@tau/editor/api";

import type { TableAlign, TableCellElement, TableElement, TableRowElement } from "./types";
import { createTableCell } from "./transforms";
import { buildCoverMap, cellSpan, isOriginCell } from "./span";

/**
 * 表格结构不变式：table → row → cell 三层严格、每行格数相同、至少 1×1、
 * align 长度等于列数、合并跨度合法且被覆盖格为空。每条规则只修一处并返回 true，由 Slate 继续下一轮。
 */

const isElementOfType = (node: Node, type: string) =>
  SlateElement.isElement(node) && node.type === type;

/** 父节点类型不符时包一层正确的父节点（粘贴片段等场景会产生游离的行 / 格） */
const wrapIfOrphan = (editor: Editor, path: Path, parentType: string, wrapper: SlateElement) => {
  if (path.length === 0) return false;
  const parent = Node.parent(editor, path);
  if (isElementOfType(parent, parentType)) return false;
  Transforms.wrapNodes(editor, wrapper, { at: path });
  return true;
};

const normalizeTable: ElementBehaviors<TableElement>["normalize"] = (editor, [table, path]) => {
  for (const [index, child] of table.children.entries()) {
    if (isElementOfType(child, "table-row")) continue;
    if (isElementOfType(child, "table-cell")) {
      Transforms.wrapNodes(editor, { type: "table-row", children: [] }, { at: [...path, index] });
    } else {
      Transforms.removeNodes(editor, { at: [...path, index] });
    }
    return true;
  }

  const cols = Math.max(0, ...table.children.map(row => row.children.length));
  if (table.children.length === 0 || cols === 0) {
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: path });
      Transforms.insertNodes(editor, createParagraph(), { at: path });
    });
    return true;
  }

  let padded = false;
  Editor.withoutNormalizing(editor, () => {
    table.children.forEach((row, index) => {
      const missing = cols - row.children.length;
      if (missing <= 0) return;
      const cells = Array.from({ length: missing }, createTableCell);
      Transforms.insertNodes(editor, cells, { at: [...path, index, row.children.length] });
      padded = true;
    });
  });
  if (padded) return true;

  if (normalizeSpans(editor, table, path)) return true;

  if (table.align) {
    const align: TableAlign[] = Array.from({ length: cols }, (_, i) => table.align?.[i] ?? null);
    if (!align.some(value => value !== null)) {
      Transforms.unsetNodes(editor, "align", { at: path });
      return true;
    }
    if (align.length !== table.align.length || align.some((v, i) => v !== table.align?.[i])) {
      Transforms.setNodes<TableElement>(editor, { align }, { at: path });
      return true;
    }
  }
  return false;
};

const isBlankCell = (cell: TableCellElement) =>
  cell.children.length === 1 && Text.isText(cell.children[0]) && cell.children[0].text === "";

/**
 * 合并跨度：值必须是不越界的正整数（1 省略），被覆盖格不带跨度；
 * 被覆盖格里出现内容（粘贴、协同等途径）时移到原点格末尾，不丢数据。
 */
function normalizeSpans(editor: Editor, table: TableElement, path: Path): boolean {
  const rows = table.children.length;
  const cols = table.children[0]?.children.length ?? 0;
  for (const [r, row] of table.children.entries()) {
    for (const [c, cell] of row.children.entries()) {
      const at = [...path, r, c];
      for (const key of ["rowSpan", "colSpan"] as const) {
        const value = cell[key];
        if (value === undefined) continue;
        const limit = key === "rowSpan" ? rows - r : cols - c;
        const valid = Math.min(limit, cellSpan(cell)[key === "rowSpan" ? 0 : 1]);
        if (valid <= 1) Transforms.unsetNodes(editor, key, { at });
        else if (valid !== value)
          Transforms.setNodes<TableCellElement>(editor, { [key]: valid }, { at });
        else continue;
        return true;
      }
    }
  }

  const map = buildCoverMap(table);
  for (const [r, row] of table.children.entries()) {
    for (const [c, cell] of row.children.entries()) {
      if (isOriginCell(map, r, c)) continue;
      const at = [...path, r, c];
      if (cell.rowSpan !== undefined || cell.colSpan !== undefined) {
        Transforms.unsetNodes(editor, ["rowSpan", "colSpan"], { at });
        return true;
      }
      if (isBlankCell(cell)) continue;
      const [originRow, originCol] = map[r][c];
      const originPath = [...path, originRow, originCol];
      const origin = table.children[originRow].children[originCol];
      Editor.withoutNormalizing(editor, () => {
        let index = origin.children.length;
        if (!isBlankCell(origin)) {
          Transforms.insertNodes(
            editor,
            { type: "formatted", text: "\n" },
            { at: [...originPath, index++] }
          );
        } else {
          Transforms.removeNodes(editor, { at: [...originPath, 0] });
          index = 0;
        }
        for (let i = 0; i < cell.children.length; i++) {
          Transforms.moveNodes(editor, { at: [...at, 0], to: [...originPath, index++] });
        }
        Transforms.insertNodes(editor, { type: "formatted", text: "" }, { at: [...at, 0] });
      });
      return true;
    }
  }
  return false;
}

const normalizeRow: ElementBehaviors<TableRowElement>["normalize"] = (editor, [row, path]) => {
  if (wrapIfOrphan(editor, path, "table", { type: "table", children: [] })) return true;
  for (const [index, child] of (row.children as Node[]).entries()) {
    if (isElementOfType(child, "table-cell")) continue;
    const childPath = [...path, index];
    if (Text.isText(child) || Editor.isInline(editor, child as SlateElement)) {
      Transforms.wrapNodes(editor, { type: "table-cell", children: [] }, { at: childPath });
    } else if (isElementOfType(child, "paragraph")) {
      Transforms.setNodes(editor, { type: "table-cell" } as Partial<TableCellElement>, {
        at: childPath,
      });
    } else {
      Transforms.removeNodes(editor, { at: childPath });
    }
    return true;
  }
  return false;
};

const normalizeCell: ElementBehaviors<TableCellElement>["normalize"] = (editor, [cell, path]) => {
  if (wrapIfOrphan(editor, path, "table-row", { type: "table-row", children: [] })) return true;
  // 格内只允许行内内容：块级子节点就地解包（嵌套表格会逐层解开）
  for (const [index, child] of (cell.children as Node[]).entries()) {
    if (SlateElement.isElement(child) && Editor.isBlock(editor, child)) {
      Transforms.unwrapNodes(editor, { at: [...path, index] });
      return true;
    }
  }
  return false;
};

export const tableNormalize = { normalize: normalizeTable };
export const tableRowNormalize = { normalize: normalizeRow };
export const tableCellNormalize = { normalize: normalizeCell };
