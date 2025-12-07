import { invoke } from "@/electron";
import type {
  WeReadHttpRequestPayload,
  WeReadHttpResponse,
  WeReadLoginResult,
  Notebook,
} from "@/types/weread";
import type { DataTableView } from "@/types";

export async function weReadHttpRequest<T = unknown>(
  payload: WeReadHttpRequestPayload,
): Promise<WeReadHttpResponse<T>> {
  return (await invoke(
    "weread:http-request",
    payload,
  )) as WeReadHttpResponse<T>;
}

export async function weReadLoginWithQRCode(): Promise<WeReadLoginResult> {
  return (await invoke("weread:login-with-qr")) as WeReadLoginResult;
}

export async function saveWeReadNotebook(notebook: Notebook): Promise<void> {
  return invoke("weread:save-notebook", notebook);
}

export async function saveWeReadNotebooks(
  notebooks: Notebook[],
): Promise<void> {
  return invoke("weread:save-notebooks", notebooks);
}

export async function getAllWeReadNotebooks(): Promise<Notebook[]> {
  return invoke("weread:get-all-notebooks");
}

export async function getWeReadNotebookById(
  bookId: string,
): Promise<Notebook | null> {
  return invoke("weread:get-notebook-by-id", bookId);
}

export async function deleteWeReadNotebook(bookId: string): Promise<void> {
  return invoke("weread:delete-notebook", bookId);
}

export async function updateWeReadNotebook(notebook: Notebook): Promise<void> {
  return invoke("weread:update-notebook", notebook);
}

export async function getWeReadLastSyncTime(): Promise<number | null> {
  return invoke("weread:get-last-sync-time");
}

export async function updateWeReadSyncTime(timestamp: number): Promise<void> {
  return invoke("weread:update-sync-time", timestamp);
}

export async function saveWeReadView(
  view: DataTableView,
): Promise<DataTableView> {
  return invoke("weread:save-view", view);
}

export async function getAllWeReadViews(): Promise<DataTableView[]> {
  return invoke("weread:get-all-views");
}

export async function updateWeReadView(view: DataTableView): Promise<void> {
  return invoke("weread:update-view", view);
}

export async function deleteWeReadView(viewId: number): Promise<void> {
  return invoke("weread:delete-view", viewId);
}

export async function saveWeReadActiveViewId(viewId: number): Promise<void> {
  return invoke("weread:save-active-view-id", viewId);
}

export async function getWeReadActiveViewId(): Promise<number | null> {
  return invoke("weread:get-active-view-id");
}

export async function updateWeReadViewsOrder(
  orderedIds: number[],
): Promise<void> {
  return invoke("weread:update-views-order", orderedIds);
}

export async function saveWeReadColumnWidths(
  widths: Record<string, number>,
): Promise<void> {
  return invoke("weread:save-column-widths", widths);
}

export async function getWeReadColumnWidths(): Promise<Record<string, number>> {
  return invoke("weread:get-column-widths");
}

export async function saveWeReadRowOrder(rowIds: string[]): Promise<void> {
  return invoke("weread:save-row-order", rowIds);
}

export async function getWeReadRowOrder(): Promise<string[] | null> {
  return invoke("weread:get-row-order");
}
