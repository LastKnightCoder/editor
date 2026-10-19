import type { TableElement, TableRowElement, TableCellElement } from "./types";
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    table: TableElement;
    "table-row": TableRowElement;
    "table-cell": TableCellElement;
  }
}
