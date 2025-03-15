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

// Vec-Document 相关方法
// 向量搜索
export const searchVecDocument = async (
  searchParams: SearchParams,
): Promise<SearchResult[]> => {
  try {
    return await invoke("vec-document-search-content", searchParams);
  } catch (error) {
    console.error("向量搜索失败:", error);
    return [];
  }
};

// 索引向量内容
export const indexVecDocumentContent = async (
  indexParams: IndexParams,
): Promise<boolean> => {
  try {
    await invoke("vec-document-index-content", indexParams);
    return true;
  } catch (error) {
    console.error("索引向量内容失败:", error);
    return false;
  }
};

// 批量索引向量内容
export const batchIndexVecDocumentContent = async (
  items: Array<IndexParams>,
): Promise<boolean> => {
  try {
    await invoke("vec-document-batch-index-content", items);
    return true;
  } catch (error) {
    console.error("批量索引向量内容失败:", error);
    return false;
  }
};

// 移除向量索引
export const removeVecDocumentIndex = async (
  id: number,
  type: string,
): Promise<boolean> => {
  try {
    await invoke("vec-document-remove-index", id, type);
    return true;
  } catch (error) {
    console.error("移除向量索引失败:", error);
    return false;
  }
};

// 获取所有向量索引结果
export const getAllVecDocumentResults = async (
  type?: IndexType,
): Promise<SearchResult[]> => {
  try {
    return await invoke("get-all-vec-document-results", type);
  } catch (error) {
    console.error("获取向量索引结果失败:", error);
    return [];
  }
};
