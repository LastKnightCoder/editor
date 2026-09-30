import { defineElement, defineExtension } from "../../api";

import type { TableElement, TableCellElement, TableRowElement } from "../../types";

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
      render: Table,
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
    }),
  ],
  commands: tableCommands,
  hotkeys: tableHotkeys,
});
