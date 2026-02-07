import { useCallback } from "react";

interface SummaryCache {
  url: string;
  summary: string;
  timestamp: number;
  title?: string;
}

const STORAGE_PREFIX = "tau-summary-cache:";

/**
 * URL hash 生成函数
 * 使用 base64 编码并移除特殊字符，限制长度
 */
const getUrlHash = (url: string): string => {
  try {
    return btoa(url)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 50);
  } catch {
    // fallback：使用简单的字符替换
    return url.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);
  }
};

/**
 * 总结缓存管理 Hook
 * 使用 chrome.storage.local 持久化缓存
 */
export function useSummaryCache() {
  /**
   * 获取缓存的总结
   */
  const getSummary = useCallback(
    async (url: string): Promise<SummaryCache | null> => {
      try {
        const hash = getUrlHash(url);
        const key = `${STORAGE_PREFIX}${hash}`;
        const result = await chrome.storage.local.get(key);
        const cache = result[key] as SummaryCache | undefined;

        // 验证缓存是否有效（检查 URL 是否匹配）
        if (cache && cache.url === url) {
          return cache;
        }
        return null;
      } catch (error) {
        console.error("Failed to get summary cache:", error);
        return null;
      }
    },
    [],
  );

  /**
   * 保存总结到缓存
   */
  const saveSummary = useCallback(
    async (url: string, summary: string, title?: string): Promise<void> => {
      try {
        const hash = getUrlHash(url);
        const key = `${STORAGE_PREFIX}${hash}`;
        const cache: SummaryCache = {
          url,
          summary,
          timestamp: Date.now(),
          title,
        };
        await chrome.storage.local.set({ [key]: cache });
      } catch (error) {
        console.error("Failed to save summary cache:", error);
      }
    },
    [],
  );

  /**
   * 清除特定 URL 的缓存
   */
  const clearSummary = useCallback(async (url: string): Promise<void> => {
    try {
      const hash = getUrlHash(url);
      const key = `${STORAGE_PREFIX}${hash}`;
      await chrome.storage.local.remove(key);
    } catch (error) {
      console.error("Failed to clear summary cache:", error);
    }
  }, []);

  /**
   * 清除所有总结缓存
   */
  const clearAllSummaries = useCallback(async (): Promise<void> => {
    try {
      const allKeys = await chrome.storage.local.get(null);
      const summaryKeys = Object.keys(allKeys).filter((key) =>
        key.startsWith(STORAGE_PREFIX),
      );

      if (summaryKeys.length > 0) {
        await chrome.storage.local.remove(summaryKeys);
      }
    } catch (error) {
      console.error("Failed to clear all summary caches:", error);
    }
  }, []);

  return {
    getSummary,
    saveSummary,
    clearSummary,
    clearAllSummaries,
  };
}
