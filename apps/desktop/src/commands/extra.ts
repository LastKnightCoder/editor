import { invoke } from "@/electron";

export const openExternal = async (url: string) => {
  return await invoke("open-external", url);
};

export const nodeFetch = async (url: string, options: any) => {
  return await invoke("node-fetch", url, options);
};

export const getVersions = async () => {
  return await invoke("get-versions");
};

export const resolvePath = async (path: string) => {
  return await invoke("resolve-path", path);
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
