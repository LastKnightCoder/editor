import type { ColumnDef, RowData } from "@tau/shared";

// Desktop-specific types for data table commands
export interface CreateDataTable {
  columns: ColumnDef[];
  rows: RowData[];
  activeViewId?: number | null;
}

export interface UpdateDataTable {
  id: number;
  columns?: ColumnDef[];
  rows?: RowData[];
  activeViewId?: number | null;
  height?: number;
}
