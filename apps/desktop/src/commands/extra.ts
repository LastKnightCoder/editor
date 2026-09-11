import { invoke, send } from "@/electron";
import { platform } from "@/platform";
import { v4 as uuidv4 } from "uuid";
import type { SaveFileWithDialogPayload, SaveFileWithDialogResult } from "@/types";

export const openExternal = async (url: string) => {
  return platform.shell.openExternal(url);
};

/** 通知主进程渲染侧退出准备完成，可以继续退出流程 */
export const notifyAppQuittingReady = async () => {
  return await invoke("app:quitting-ready");
};

const createAbortError = () => {
  const error = new Error("nodeFetch aborted");
  error.name = "AbortError";
  return error;
};

const createNodeFetchRequestId = () => `node-fetch:${uuidv4()}`;

export interface NodeFetchRawResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string | string[] | number | boolean | null>;
  finalUrl: string;
}

export const nodeFetch = async <T = unknown>(
  url: string,
  options: Record<string, unknown> & { signal?: AbortSignal } = {}
): Promise<T> => {
  const { signal, ...serializableOptions } = options;
  if (!signal) {
    return await invoke("node-fetch", url, serializableOptions);
  }

  if (signal.aborted) {
    throw createAbortError();
  }

  const requestId = createNodeFetchRequestId();
  const handleAbort = () => {
    send("node-fetch:abort", { requestId });
  };

  signal.addEventListener("abort", handleAbort, { once: true });
  try {
    return await invoke("node-fetch", url, {
      ...serializableOptions,
      requestId,
    });
  } catch (error) {
    if (signal.aborted) {
      throw createAbortError();
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", handleAbort);
  }
};

export const getVersions = async () => {
  return await invoke<{ app: string; node: string; v8: string; chrome: string; electron: string }>(
    "get-versions"
  );
};

export const resolvePath = async (path: string) => {
  return await invoke<string>("resolve-path", path);
};

export const selectDirectoryWithDialog = async (): Promise<string | null> => {
  return platform.fileDialog.selectDirectory();
};

/**
 * 下载文件并弹出保存对话框
 * @param url 文件 URL
 * @param defaultFileName 默认文件名
 * @returns 保存的文件路径，如果用户取消则返回 null
 */
export const downloadFileWithDialog = async (
  url: string,
  defaultFileName?: string
): Promise<string | null> => {
  return platform.fileDialog.downloadFile(url, defaultFileName);
};

/**
 * 通用保存：弹保存对话框并把文本/二进制内容写入所选路径
 */
export const saveFileWithDialog = async (
  payload: SaveFileWithDialogPayload
): Promise<SaveFileWithDialogResult> => {
  return platform.fileDialog.saveFile(payload);
};
