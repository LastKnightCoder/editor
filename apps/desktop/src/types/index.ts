export * from "./card";
export * from "./article";
export * from "./project";
export * from "./database-item";
export * from "./vibe-learning-project";
export * from "./pdf";
export * from "./epub-export";
export * from "./pdf-export";
export * from "./batch-export";
export * from "./save-file";
export * from "./white-board";
export * from "./llm";
export * from "./embedding";
export * from "./chat-message";
export * from "./vec-document";
export * from "./operation";
export * from "./statistic";
export * from "./search";
export * from "./video-note";
export * from "./video-note-item";
export * from "./audio-note";
export * from "./sync";
export * from "./question";
export * from "./entity";
export * from "./content";
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
  KanbanCardTemplate,
  KanbanCardDisplayConfig,
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
export * from "./pomodoro";
export * from "./calendar";
export * from "./file-tree";
export * from "./podcast";
export * from "./web-link";
export * from "./web-clip";
export * from "./content-link";
export * from "./web-note";
export * from "./web-view-preference";
export * from "./diary";
export * from "./skill";
export * from "./tool";
export * from "./mcp";
export * from "./youtube";
export * from "./flashcard";
export * from "./resource-sync";
export * from "./vibe-learning";
export * from "./vl-quiz";

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
