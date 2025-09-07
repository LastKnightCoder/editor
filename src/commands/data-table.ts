import { invoke } from "@/electron";
import { DataTable, CreateDataTable, UpdateDataTable } from "@/types";

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

export const deleteDataTable = async (id: number): Promise<number> => {
  return invoke("data-table:delete", id);
};
