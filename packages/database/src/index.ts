import Database, { DatabaseRef } from "./Database";
import { PluginManager } from "./PluginManager";
import * as plugins from "./plugins";
import { createDatabaseStore } from "./DatabaseStore";
import { DatabaseContext, DatabaseStoreType } from "./DatabaseContext";
import * as hooks from "./hooks";
import { defineDatabaseExtension } from "./extensions";
import type { DatabaseExtension, DatabaseContributions, DatabaseFieldOverride } from "./extensions";
import type {
  DatabaseProps,
  DatabaseConfig,
  ColumnDef,
  RowData,
  CellValue,
  CellPlugin,
  FieldCapabilities,
  ValidationRule,
  DatabaseData,
  TableViewConfig,
  FilterGroup,
  DatabaseQuery,
  DatabaseCommand,
  DatabaseChange,
  RowChanges,
} from "./types";

export type {
  DatabaseProps,
  DatabaseRef,
  DatabaseConfig,
  ColumnDef,
  RowData,
  CellValue,
  CellPlugin,
  FieldCapabilities,
  ValidationRule,
  DatabaseData,
  DatabaseStoreType,
  DatabaseExtension,
  DatabaseContributions,
  DatabaseFieldOverride,
  TableViewConfig,
  FilterGroup,
  DatabaseQuery,
  DatabaseCommand,
  DatabaseChange,
  RowChanges,
};

export {
  PluginManager,
  plugins,
  createDatabaseStore,
  DatabaseContext,
  hooks,
  defineDatabaseExtension,
};

export default Database;
export { DatabaseHostContext } from "./DatabaseHostContext";
export type * from "./DatabaseHostContext";
export { default as RowDetailModal } from "./components/RowDetailModal";
export { default as LinkPlugin } from "./plugins/LinkPlugin";
export type { DateValue, DatePluginConfig } from "./plugins/DatePlugin";
export type { DatabaseView, DatabaseViewType, SortRule } from "./types";
export { useDatabaseStore } from "./hooks";
export { default as Database } from "./Database";
export { normalizeUrl } from "./plugins/LinkPlugin/utils";
export type * from "./types";
