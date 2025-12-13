export * from "./card";
export * from "./article";
export * from "./document";
export * from "./time_record";
export * from "./project";
export * from "./pdf";
export * from "./epub";
export * from "./white-board";
export * from "./voice-copy";
export * from "./llm";
export * from "./chat-message";
export * from "./vec-document";
export * from "./operation";
export * from "./statistic";
export * from "./search";
export * from "./video-note";
export * from "./video-note-item";
export * from "./sync";
export * from "./question";
export * from "./content";
export * from "./goal";
// Data table types are now exported from @tau/shared
export type {
  DataTable,
  ColumnDef as DataTableColumn,
  RowData as DataTableRow,
  DatabaseData,
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
  TableViewConfig as DataTableViewConfig,
  DataTableViewType,
  GalleryViewConfig,
  CalendarViewConfig,
  KanbanViewConfig,
  FilterLogicOperator,
  FilterCondition,
  FilterGroup,
  FilterNode,
  SortRule,
  GroupRule,
  ValidationRule,
} from "@tau/shared";
// Desktop-specific data table command types
export * from "./data-table-commands";
export * from "./todo";
export * from "./rpc";
export * from "./shortcut";
export * from "./pomodoro";
export * from "./notion-sync";
export * from "./calendar";
export * from "./file-tree";
export * from "./podcast";
export * from "./resource";
export * from "./web-link";
export * from "./web-clip";
export * from "./content-link";
export * from "./web-note";
export * from "./web-view-preference";
export * from "./diary";
export * from "./prompt";
export * from "./tool";
export * from "./mcp";
export * from "./youtube";
export * from "./flashcard";
export * from "./resource-sync";
export * from "./slide";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
