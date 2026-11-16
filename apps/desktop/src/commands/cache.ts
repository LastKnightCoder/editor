import { invoke } from "@/electron";

/**
 * 写入缓存文件
 */
export const writeCacheFile = async (filePath: string, data: unknown): Promise<void> => {
  return invoke("write-cache-file", filePath, data);
};

/**
 * 读取缓存文件
 */
export const readCacheFile = async (filePath: string): Promise<unknown | null> => {
  return invoke("read-cache-file", filePath);
};

/**
 * 检查缓存文件是否存在
 */
export const cacheFileExists = async (filePath: string): Promise<boolean> => {
  return invoke("cache-file-exists", filePath);
};
