import Table from "./components/Table";
import { PluginManager } from "./PluginManager";
import * as plugins from "./plugins";
import { createTableStore } from "./TableStore";
import { TableContext, TableStoreType } from "./TableContext";
import * as hooks from "./hooks";
import type {
  TableProps,
  ColumnDef,
  RowData,
  CellValue,
  CellPlugin,
  ValidationRule,
  TableData,
} from "./types";

export type {
  TableProps,
  ColumnDef,
  RowData,
  CellValue,
  CellPlugin,
  ValidationRule,
  TableData,
  TableStoreType,
};

export { PluginManager, plugins, createTableStore, TableContext, hooks };

export default Table;
