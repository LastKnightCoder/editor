import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { Notebook } from "@/types/weread";

const invokeWeRead = <T = any>(channel: string, ...args: any[]): Promise<T> =>
  withModule("weread", () => invoke<T>(channel, ...args));

export async function saveWeReadNotebook(notebook: Notebook): Promise<void> {
  return invokeWeRead("weread:save-notebook", notebook);
}

export async function saveWeReadNotebooks(notebooks: Notebook[]): Promise<void> {
  return invokeWeRead("weread:save-notebooks", notebooks);
}

export async function getAllWeReadNotebooks(): Promise<Notebook[]> {
  return invokeWeRead("weread:get-all-notebooks");
}

export async function getWeReadNotebookById(bookId: string): Promise<Notebook | null> {
  return invokeWeRead("weread:get-notebook-by-id", bookId);
}

export async function deleteWeReadNotebook(bookId: string): Promise<void> {
  return invokeWeRead("weread:delete-notebook", bookId);
}

export async function updateWeReadNotebook(notebook: Notebook): Promise<void> {
  return invokeWeRead("weread:update-notebook", notebook);
}

export async function getWeReadLastSyncTime(): Promise<number | null> {
  return invokeWeRead("weread:get-last-sync-time");
}

export async function updateWeReadSyncTime(timestamp: number): Promise<void> {
  return invokeWeRead("weread:update-sync-time", timestamp);
}
