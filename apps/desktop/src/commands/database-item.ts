import { invoke } from "@/electron";
import { DatabaseItem, DatabaseItemSummary, CreateDatabaseItem, UpdateDatabaseItem } from "@/types";

export const createDatabaseItem = async (payload: CreateDatabaseItem): Promise<DatabaseItem> => {
  return invoke("database-item:create", payload);
};

export const updateDatabaseItem = async (
  payload: UpdateDatabaseItem
): Promise<DatabaseItem | null> => {
  return invoke("database-item:update", payload);
};

export const deleteDatabaseItem = async (id: number): Promise<number> => {
  return invoke("database-item:delete", id);
};

export const getDatabaseItem = async (id: number): Promise<DatabaseItem | null> => {
  return invoke("database-item:get", id);
};

export const listDatabaseItems = async (): Promise<DatabaseItemSummary[]> => {
  return invoke("database-item:list");
};

/** 记录打开（不改 updateTime） */
export const recordDatabaseItemOpen = async (id: number): Promise<void> => {
  await invoke("database-item:record-open", id);
};
