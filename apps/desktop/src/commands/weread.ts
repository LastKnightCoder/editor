import { invoke } from "@/electron";
import { withModule } from "./module-init";
import type { Notebook } from "@/types/weread";
import type { DataTableView } from "@/types";

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

export async function saveWeReadView(view: DataTableView): Promise<DataTableView> {
  return invokeWeRead("weread:save-view", view);
}

export async function getAllWeReadViews(): Promise<DataTableView[]> {
  return invokeWeRead("weread:get-all-views");
}

export async function updateWeReadView(view: DataTableView): Promise<void> {
  return invokeWeRead("weread:update-view", view);
}

export async function deleteWeReadView(viewId: number): Promise<void> {
  return invokeWeRead("weread:delete-view", viewId);
}

export async function saveWeReadActiveViewId(viewId: number): Promise<void> {
  return invokeWeRead("weread:save-active-view-id", viewId);
}

export async function getWeReadActiveViewId(): Promise<number | null> {
  return invokeWeRead("weread:get-active-view-id");
}

export async function updateWeReadViewsOrder(orderedIds: number[]): Promise<void> {
  return invokeWeRead("weread:update-views-order", orderedIds);
}

export async function saveWeReadColumnWidths(widths: Record<string, number>): Promise<void> {
  return invokeWeRead("weread:save-column-widths", widths);
}

export async function getWeReadColumnWidths(): Promise<Record<string, number>> {
  return invokeWeRead("weread:get-column-widths");
}

export async function saveWeReadRowOrder(rowIds: string[]): Promise<void> {
  return invokeWeRead("weread:save-row-order", rowIds);
}

export async function getWeReadRowOrder(): Promise<string[] | null> {
  return invokeWeRead("weread:get-row-order");
}
