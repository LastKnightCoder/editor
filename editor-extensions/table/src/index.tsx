import type {} from "./augmentations";
import { defineElement, defineExtension } from "@tau/editor/api";

import type { TableElement, TableCellElement, TableRowElement } from "./types";

import Table from "./components/Table";
import TableRow from "./components/TableRow";
import TableCell from "./components/TableCell";
import { tableCellBehaviors, tableForParagraph } from "./behaviors";
import { tableCommands, tableHotkeys } from "./commands";
import { withTableCellSelection } from "./selection";
import { withTablePaste } from "./paste";
import { tableCellNormalize, tableNormalize, tableRowNormalize } from "./normalize";
import blockPanelItems from "./block-panel-items";

export const tableExtension = defineExtension({
  id: "tau.table",
  elements: [
    defineElement<TableElement>({
      type: "table",
      kind: "block",
      isEmpty: (element, context) =>
        element.children.every(row =>
          row.children.every(cell => cell.children.every(context.isEmpty))
        ),
      render: Table,
      behaviors: tableNormalize,
      copy: ({ element, fullySelected }) =>
        fullySelected ||
        (element.children.length > 0 && element.children.every(child => child.type === "table-row"))
          ? "keep"
          : "unwrap",
      drag: true,
    }),
  ],
  blockPanel: blockPanelItems,
  // 格选区的删除 / 输入 / 复制与表格粘贴改写的是编辑器级方法，不在 ElementBehaviors 方法面上，
  // 保留为受信任层插件（ER-005）
  plugins: [withTableCellSelection, withTablePaste],
  behaviorsFor: {
    paragraph: tableForParagraph,
  },
});

export const tableRowExtension = defineExtension({
  id: "tau.table-row",
  elements: [
    defineElement<TableRowElement>({
      type: "table-row",
      kind: "block",
      render: TableRow,
      behaviors: tableRowNormalize,
      copy: ({ element, fullySelected }) =>
        fullySelected ||
        (element.children.length > 0 &&
          element.children.every(child => child.type === "table-cell"))
          ? "keep"
          : "unwrap",
    }),
  ],
});

export const tableCellExtension = defineExtension({
  id: "tau.table-cell",
  elements: [
    defineElement<TableCellElement>({
      type: "table-cell",
      kind: "block",
      render: TableCell,
      behaviors: { ...tableCellBehaviors, ...tableCellNormalize },
      copy: ({ fullySelected }) => (fullySelected ? "keep" : "unwrap"),
    }),
  ],
  commands: tableCommands,
  hotkeys: tableHotkeys,
});

export const tableExtensions = [tableExtension, tableRowExtension, tableCellExtension] as const;
export type { TableElement, TableRowElement, TableCellElement, TableAlign } from "./types";
export * from "./transforms";
export {
  getCellSelection,
  selectCells,
  selectRows,
  selectColumns,
  type CellSelection,
  type CellSelectionKind,
} from "./selection";
export { insertTable } from "./insertTable";
