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

// ==================== 微信读书笔记数据库操作 ====================

/**
 * 保存笔记本到数据库
 */
export async function saveWeReadNotebook(notebook: Notebook): Promise<void> {
  return invoke("weread:save-notebook", notebook);
}

/**
 * 批量保存笔记本
 */
export async function saveWeReadNotebooks(
  notebooks: Notebook[],
): Promise<void> {
  return invoke("weread:save-notebooks", notebooks);
}

/**
 * 从数据库获取所有笔记本
 */
export async function getAllWeReadNotebooks(): Promise<Notebook[]> {
  return invoke("weread:get-all-notebooks");
}

/**
 * 根据书籍ID获取笔记本
 */
export async function getWeReadNotebookById(
  bookId: string,
): Promise<Notebook | null> {
  return invoke("weread:get-notebook-by-id", bookId);
}

/**
 * 删除笔记本
 */
export async function deleteWeReadNotebook(bookId: string): Promise<void> {
  return invoke("weread:delete-notebook", bookId);
}

/**
 * 更新笔记本（用于同步后更新）
 */
export async function updateWeReadNotebook(notebook: Notebook): Promise<void> {
  return invoke("weread:update-notebook", notebook);
}

/**
 * 获取上次同步时间
 */
export async function getWeReadLastSyncTime(): Promise<number | null> {
  return invoke("weread:get-last-sync-time");
}

/**
 * 更新同步时间
 */
export async function updateWeReadSyncTime(timestamp: number): Promise<void> {
  return invoke("weread:update-sync-time", timestamp);
}

// ==================== 微信读书视图配置 ====================

/**
 * 保存视图配置
 */
export async function saveWeReadView(
  view: DataTableView,
): Promise<DataTableView> {
  return invoke("weread:save-view", view);
}

/**
 * 获取所有视图
 */
export async function getAllWeReadViews(): Promise<DataTableView[]> {
  return invoke("weread:get-all-views");
}

/**
 * 更新视图
 */
export async function updateWeReadView(view: DataTableView): Promise<void> {
  return invoke("weread:update-view", view);
}

/**
 * 删除视图
 */
export async function deleteWeReadView(viewId: number): Promise<void> {
  return invoke("weread:delete-view", viewId);
}

/**
 * 保存活动视图 ID
 */
export async function saveWeReadActiveViewId(viewId: number): Promise<void> {
  return invoke("weread:save-active-view-id", viewId);
}

/**
 * 获取活动视图 ID
 */
export async function getWeReadActiveViewId(): Promise<number | null> {
  return invoke("weread:get-active-view-id");
}

/**
 * 更新视图顺序
 */
export async function updateWeReadViewsOrder(
  orderedIds: number[],
): Promise<void> {
  return invoke("weread:update-views-order", orderedIds);
}

// ==================== 微信读书配置 ====================

/**
 * 保存列宽度配置
 */
export async function saveWeReadColumnWidths(
  widths: Record<string, number>,
): Promise<void> {
  return invoke("weread:save-column-widths", widths);
}

/**
 * 获取所有列宽度配置
 */
export async function getWeReadColumnWidths(): Promise<Record<string, number>> {
  return invoke("weread:get-column-widths");
}

/**
 * 保存行顺序
 */
export async function saveWeReadRowOrder(rowIds: string[]): Promise<void> {
  return invoke("weread:save-row-order", rowIds);
}

/**
 * 获取行顺序
 */
export async function getWeReadRowOrder(): Promise<string[] | null> {
  return invoke("weread:get-row-order");
}
