import { invoke } from "../electron";
import { SearchParams, SearchResult, IndexParams, IndexType } from "@/types";

export const searchFTS = async (
  searchParams: SearchParams,
): Promise<SearchResult[]> => {
  try {
    return await invoke("fts-search-content", searchParams);
  } catch (error) {
    console.error("全文搜索失败:", error);
    return [];
  }
};

// 索引内容
export const indexFTSContent = async (
  indexParams: IndexParams,
): Promise<boolean> => {
  try {
    // 调用Electron的IPC接口索引FTS内容
    await invoke("fts-index-content", indexParams);
    return true;
  } catch (error) {
    console.error("索引内容失败:", error);
    return false;
  }
};

// 批量索引内容
export const batchIndexFTSContent = async (
  items: Array<IndexParams>,
): Promise<boolean> => {
  try {
    await invoke("fts-batch-index-content", items);
    return true;
  } catch (error) {
    console.error("批量索引内容失败:", error);
    return false;
  }
};

// 移除索引
export const removeFTSIndex = async (
  id: number,
  type: string,
): Promise<boolean> => {
  try {
    await invoke("fts-remove-index", id, type);
    return true;
  } catch (error) {
    console.error("移除索引失败:", error);
    return false;
  }
};

// 获取所有FTS索引结果
export const getAllFTSResults = async (
  type?: IndexType,
): Promise<SearchResult[]> => {
  try {
    return await invoke("get-all-fts-results", type);
  } catch (error) {
    console.error("获取FTS索引结果失败:", error);
    return [];
  }
};

export const checkFTSIndexStatus = async (
  id: number,
  type: IndexType,
): Promise<{ updateTime: number } | null> => {
  try {
    // 调用Electron的IPC接口检查FTS索引状态
    return await invoke("fts-check-index-exists", id, type);
  } catch (error) {
    console.error("检查FTS索引状态失败:", error);
    return null;
  }
};
