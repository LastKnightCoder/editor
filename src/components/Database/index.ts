import Database, { DatabaseRef } from "./Database";
import { PluginManager } from "./PluginManager";
import * as plugins from "./plugins";
import { createDatabaseStore } from "./DatabaseStore";
import { DatabaseContext, DatabaseStoreType } from "./DatabaseContext";
import * as hooks from "./hooks";
import type {
  DatabaseProps,
  DatabaseConfig,
  ColumnDef,
  RowData,
  CellValue,
  CellPlugin,
  ValidationRule,
  DatabaseData,
  TableViewConfig,
} from "./types";

export type {
  DatabaseProps,
  DatabaseRef,
  DatabaseConfig,
  ColumnDef,
  RowData,
  CellValue,
  CellPlugin,
  ValidationRule,
  DatabaseData,
  DatabaseStoreType,
  TableViewConfig,
};

export { PluginManager, plugins, createDatabaseStore, DatabaseContext, hooks };

export default Database;
