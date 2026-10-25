import { invoke } from "@/electron";
import { queryClient } from "@/queryClient";
import type { DataTableTarget } from "@tau/shared/database-types";
import type { ContentEntityReference } from "@tau/db-schema/content-identities";
import {
  DataTable,
  CreateDataTable,
  UpdateDataTable,
  PatchDataTableRow,
  ApplyDataTableChanges,
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
} from "@/types";

export const createDataTable = async (table: CreateDataTable): Promise<DataTable> => {
  return invoke("data-table:create", table);
};
export const createPendingDataTable = (): Promise<{
  table: DataTable;
  reference: ContentEntityReference;
}> => invoke("data-table:create-pending");

export const updateDataTable = async (table: UpdateDataTable): Promise<DataTable> => {
  const updated = await invoke<DataTable>("data-table:update", table);
  if (updated && table.rows !== undefined) {
    void queryClient.invalidateQueries({ queryKey: ["databases", "list"] });
  }
  return updated;
};

export const getDataTableById = async (id: DataTableTarget): Promise<DataTable> => {
  return invoke("data-table:get-by-id", id);
};

export const patchDataTableRow = (input: PatchDataTableRow): Promise<boolean> => {
  return invoke("data-table:patch-row", input);
};

export const updateDataTableChanges = async (
  input: ApplyDataTableChanges
): Promise<DataTable | null> => {
  const result = await invoke<DataTable | null>("data-table:apply-changes", input);
  if (result && (input.rows.remove.length || input.rows.inserted?.length)) {
    void queryClient.invalidateQueries({ queryKey: ["databases", "list"] });
  }
  return result;
};

export const getDataTableDetail = async (
  id: DataTableTarget
): Promise<{ table: DataTable | null; views: DataTableView[] }> => {
  return invoke("data-table:get-detail", id);
};

export const setActiveDataTableView = async (
  tableId: DataTableTarget,
  viewId: number | null
): Promise<DataTable | null> => {
  return invoke("data-table:set-active-view", { tableId, viewId });
};

export const deleteDataTable = async (id: number): Promise<number> => {
  return invoke("data-table:delete", id);
};

export const incrementDataTableRefCount = async (id: number): Promise<number> => {
  return invoke("data-table:increment-ref-count", id);
};

export const createDataTableView = async (view: CreateDataTableView): Promise<DataTableView> => {
  return invoke("data-table-view:create", view);
};

export const updateDataTableView = async (
  view: UpdateDataTableView
): Promise<DataTableView | null> => {
  return invoke("data-table-view:update", view);
};

export const deleteDataTableView = async (
  id: number | { id: number; tableId: DataTableTarget }
): Promise<number> => {
  return invoke("data-table-view:delete", id);
};

export const reorderDataTableViews = async (
  tableId: DataTableTarget,
  orderedIds: number[]
): Promise<void> => {
  await invoke("data-table-view:reorder", { tableId, orderedIds });
};

export const listDataTableViews = async (tableId: DataTableTarget): Promise<DataTableView[]> => {
  return invoke("data-table-view:list-by-table", tableId);
};
