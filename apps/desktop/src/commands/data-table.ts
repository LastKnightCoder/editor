import { invoke } from "@/electron";
import {
  DataTable,
  CreateDataTable,
  UpdateDataTable,
  DataTableView,
  CreateDataTableView,
  UpdateDataTableView,
} from "@/types";

export const createDataTable = async (
  table: CreateDataTable,
): Promise<DataTable> => {
  return invoke("data-table:create", table);
};

export const updateDataTable = async (
  table: UpdateDataTable,
): Promise<DataTable> => {
  return invoke("data-table:update", table);
};

export const getDataTableById = async (id: number): Promise<DataTable> => {
  return invoke("data-table:get-by-id", id);
};

export const getDataTableDetail = async (
  id: number,
): Promise<{ table: DataTable | null; views: DataTableView[] }> => {
  return invoke("data-table:get-detail", id);
};

export const setActiveDataTableView = async (
  tableId: number,
  viewId: number | null,
): Promise<DataTable | null> => {
  return invoke("data-table:set-active-view", { tableId, viewId });
};

export const deleteDataTable = async (id: number): Promise<number> => {
  return invoke("data-table:delete", id);
};

export const incrementDataTableRefCount = async (
  id: number,
): Promise<number> => {
  return invoke("data-table:increment-ref-count", id);
};

export const createDataTableView = async (
  view: CreateDataTableView,
): Promise<DataTableView> => {
  return invoke("data-table-view:create", view);
};

export const updateDataTableView = async (
  view: UpdateDataTableView,
): Promise<DataTableView | null> => {
  return invoke("data-table-view:update", view);
};

export const deleteDataTableView = async (id: number): Promise<number> => {
  return invoke("data-table-view:delete", id);
};

export const reorderDataTableViews = async (
  tableId: number,
  orderedIds: number[],
): Promise<void> => {
  await invoke("data-table-view:reorder", { tableId, orderedIds });
};

export const listDataTableViews = async (
  tableId: number,
): Promise<DataTableView[]> => {
  return invoke("data-table-view:list-by-table", tableId);
};
