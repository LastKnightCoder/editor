import { invoke, send } from "@/electron";
import { v4 as uuidv4 } from "uuid";

export const openExternal = async (url: string) => {
  return await invoke("open-external", url);
};

const createAbortError = () => {
  const error = new Error("nodeFetch aborted");
  error.name = "AbortError";
  return error;
};

const createNodeFetchRequestId = () => `node-fetch:${uuidv4()}`;

export const nodeFetch = async (url: string, options: any = {}) => {
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
  return await invoke("get-versions");
};

export const resolvePath = async (path: string) => {
  return await invoke("resolve-path", path);
};

export const selectDirectoryWithDialog = async (): Promise<string | null> => {
  return await invoke("select-directory-with-dialog");
};

/**
 * 下载文件并弹出保存对话框
 * @param url 文件 URL
 * @param defaultFileName 默认文件名
 * @returns 保存的文件路径，如果用户取消则返回 null
 */
export const downloadFileWithDialog = async (
  url: string,
  defaultFileName?: string,
): Promise<string | null> => {
  return await invoke("download-file-with-dialog", url, defaultFileName);
};
