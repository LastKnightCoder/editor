import type { ColumnDef, RowData } from "@tau/shared";
import type { DatabaseRowChanges, DataTableTarget } from "@tau/shared/database-types";

// Desktop-specific types for data table commands
export interface CreateDataTable {
  columns: ColumnDef[];
  rows: RowData[];
  activeViewId?: number | null;
}

export interface UpdateDataTable {
  id: DataTableTarget;
  columns?: ColumnDef[];
  rows?: RowData[];
  activeViewId?: number | null;
  height?: number;
}

export interface PatchDataTableRow {
  tableId: DataTableTarget;
  rowId: string;
  patch: Partial<RowData>;
  expected: Record<string, unknown>;
}

export interface ApplyDataTableChanges {
  id: DataTableTarget;
  rows: DatabaseRowChanges;
  columns?: ColumnDef[];
}
