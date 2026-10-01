import type {} from "./augmentations";
import { defineElement, defineExtension } from "@tau/editor/api";

import type { TableElement, TableCellElement, TableRowElement } from "./types";

import Table from "./components/Table";
import TableRow from "./components/TableRow";
import TableCell from "./components/TableCell";
import { tableCellBehaviors, tableForParagraph } from "./behaviors";
import { tableCommands, tableHotkeys } from "./commands";
import { withTableDeleteGuard } from "./deleteGuard";
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
      copy: ({ element, fullySelected }) =>
        fullySelected ||
        (element.children.length > 0 && element.children.every(child => child.type === "table-row"))
          ? "keep"
          : "unwrap",
      drag: true,
    }),
  ],
  blockPanel: blockPanelItems,
  // delete / deleteFragment 的改写是编辑器级方法（跨单元格选区防护、全选删除重置），
  // 不在 ElementBehaviors 方法面上，保留为受信任层插件（ER-005）
  plugins: [withTableDeleteGuard],
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
      behaviors: tableCellBehaviors,
      copy: ({ fullySelected }) => (fullySelected ? "keep" : "unwrap"),
    }),
  ],
  commands: tableCommands,
  hotkeys: tableHotkeys,
});

export const tableExtensions = [tableExtension, tableRowExtension, tableCellExtension] as const;
export type { TableElement, TableRowElement, TableCellElement } from "./types";
export * from "./operations";
export { insertTable } from "./insertTable";
