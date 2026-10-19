import {
  Editor,
  Element as SlateElement,
  Path,
  Range,
  Text,
  Transforms,
  type Descendant,
} from "slate";
import type { Plugin } from "@tau/editor/api";
import { setOrInsertNode } from "@tau/editor/api";

import type { TableElement } from "./types";
import { getCellSelection, selectCells } from "./selection";
import {
  clearCells,
  createTableCell,
  fillCells,
  getCellPosition,
  isTableElement,
  selectCell,
  type CellContent,
  type CellPosition,
} from "./transforms";

/**
 * 粘贴：电子表格 / 网页表格（HTML <table>）与本编辑器复制的子表。
 * 光标在格内时从该格起按格填充（不够就扩行扩列），粘完选中粘贴区域；
 * 正文里粘贴 HTML 表格则生成新表。格内粘贴普通文本保留为软换行，不拆单元格。
 */

/** 解析 TSV（Excel / Numbers 的纯文本格式），支持引号包裹的字段 */
export function parseTsv(text: string): string[][] {
  const source = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const rows: string[][] = [[]];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === "\t") {
      rows[rows.length - 1].push(field);
      field = "";
    } else if (char === "\n") {
      rows[rows.length - 1].push(field);
      rows.push([]);
      field = "";
    } else field += char;
  }
  rows[rows.length - 1].push(field);
  return rows;
}

const cellText = (cell: Element) => {
  const clone = cell.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach(br => br.replaceWith("\n"));
  return (clone.textContent ?? "")
    .replace(/[^\S\n]+/g, " ")
    .split("\n")
    .map(line => line.trim())
    .join("\n")
    .trim();
};

/** 剪贴板 HTML 的主体就是一张表格时解析为文本网格；夹带其它正文时返回 null（交给默认粘贴） */
export function parseHtmlTable(html: string): string[][] | null {
  if (!html || !/<table[\s>]/i.test(html) || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style, script").forEach(node => node.remove());
  const table = doc.querySelector("table");
  if (!table) return null;
  const compact = (value: string | null) => (value ?? "").replace(/\s/g, "");
  if (!compact(table.textContent) || compact(doc.body.textContent) !== compact(table.textContent))
    return null;
  const rows = Array.from(table.querySelectorAll("tr"))
    .filter(row => row.closest("table") === table)
    .map(row =>
      Array.from(row.children)
        .filter(cell => cell.tagName === "TD" || cell.tagName === "TH")
        .flatMap(cell => {
          const span = Math.max(1, Number(cell.getAttribute("colspan")) || 1);
          return [cellText(cell), ...Array<string>(span - 1).fill("")];
        })
    )
    .filter(row => row.length > 0);
  return rows.length ? rows : null;
}

const textGrid = (grid: string[][]): CellContent[][] =>
  grid.map(row => row.map(text => [{ type: "formatted", text }] as CellContent));

const tableFromGrid = (grid: string[][]): TableElement => {
  const width = Math.max(...grid.map(row => row.length));
  return {
    type: "table",
    children: grid.map(row => ({
      type: "table-row",
      children: Array.from({ length: width }, (_, i) =>
        row[i]
          ? { type: "table-cell", children: [{ type: "formatted", text: row[i] }] }
          : createTableCell()
      ),
    })),
  };
};

/** 粘贴落点：格选区取左上格；折叠或同格内的选区取所在格；其余不在格内 */
function pasteTarget(editor: Editor): CellPosition | undefined {
  const cellSelection = getCellSelection(editor);
  if (cellSelection) {
    const { tablePath, rowStart: row, colStart: col } = cellSelection;
    return { tablePath, row, col };
  }
  const { selection } = editor;
  if (!selection) return;
  const anchor = getCellPosition(editor, selection.anchor);
  const focus = Range.isCollapsed(selection) ? anchor : getCellPosition(editor, selection.focus);
  if (!anchor || !focus || !Path.equals(anchor.tablePath, focus.tablePath)) return;
  return anchor.row === focus.row && anchor.col === focus.col ? anchor : undefined;
}

function fillAndSelect(editor: Editor, target: CellPosition, grid: CellContent[][]) {
  if (!fillCells(editor, target.tablePath, target.row, target.col, grid)) return;
  const width = Math.max(...grid.map(row => row.length));
  selectCells(editor, target.tablePath, {
    rowStart: target.row,
    rowEnd: target.row + grid.length - 1,
    colStart: target.col,
    colEnd: target.col + width - 1,
  });
}

/** 片段里的块逐个摊平为行内内容，块之间用软换行连接（格内只允许行内） */
function flattenToInline(editor: Editor, fragment: Descendant[]): Descendant[] {
  const inlineOf = (node: Descendant): Descendant[] =>
    Text.isText(node) || (SlateElement.isElement(node) && Editor.isInline(editor, node))
      ? [node]
      : SlateElement.isElement(node)
        ? node.children.flatMap(child => inlineOf(child as Descendant))
        : [];
  const blocks = fragment.map(inlineOf).filter(nodes => nodes.length);
  return blocks.flatMap((nodes, i) =>
    i === 0 ? nodes : [{ type: "formatted", text: "\n" } as Descendant, ...nodes]
  );
}

/** 片段是否就是一张表（或表的若干行）——编辑器内复制的子表 */
function fragmentGrid(fragment: Descendant[]): CellContent[][] | undefined {
  const rows =
    fragment.length === 1 && isTableElement(fragment[0])
      ? fragment[0].children
      : fragment.every(node => SlateElement.isElement(node) && node.type === "table-row")
        ? (fragment as TableElement["children"])
        : undefined;
  return rows?.length ? rows.map(row => row.children.map(cell => cell.children)) : undefined;
}

export const withTablePaste: Plugin = editor => {
  const { insertData, insertFragment } = editor;

  editor.insertData = data => {
    // 编辑器自有片段走默认链，在 insertFragment 处处理
    if (data.getData("application/x-slate-fragment")) return insertData(data);
    const target = pasteTarget(editor);
    const htmlGrid = parseHtmlTable(data.getData("text/html"));
    if (htmlGrid) {
      if (target) fillAndSelect(editor, target, textGrid(htmlGrid));
      else {
        if (editor.selection && Range.isExpanded(editor.selection)) Transforms.delete(editor);
        const path = setOrInsertNode(editor, tableFromGrid(htmlGrid));
        if (path) Transforms.select(editor, Editor.end(editor, path));
      }
      return;
    }
    const text = data.getData("text/plain");
    if (target && text) {
      if (text.includes("\t")) fillAndSelect(editor, target, textGrid(parseTsv(text)));
      else editor.insertText(text.replace(/\r\n?/g, "\n"));
      return;
    }
    insertData(data);
  };

  editor.insertFragment = (nodes, options) => {
    const target = options?.at ? undefined : pasteTarget(editor);
    if (!target) return insertFragment(nodes, options);
    const fragment = nodes as Descendant[];
    const grid = fragmentGrid(fragment);
    if (grid) return fillAndSelect(editor, target, grid);
    // 格选区上粘贴普通内容：清空所选格，内容落进左上格
    const cellSelection = getCellSelection(editor);
    if (cellSelection) {
      clearCells(editor, target.tablePath, cellSelection);
      selectCell(editor, target.tablePath, target.row, target.col, "start");
    }
    insertFragment(flattenToInline(editor, fragment), options);
  };

  return editor;
};
