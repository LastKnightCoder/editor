import { invoke } from "../electron";
import { SearchParams, SearchResult, IndexParams, IndexType } from "@/types";

export const searchVecDocument = async (
  searchParams: SearchParams,
): Promise<SearchResult[]> => {
  try {
    return await invoke("vec-document-search-content", searchParams);
  } catch (error) {
    console.error("全文搜索失败:", error);
    return [];
  }
};

// 索引内容
export const indexVecDocumentContent = async (
  indexParams: IndexParams,
): Promise<boolean> => {
  try {
    // 调用Electron的IPC接口索引FTS内容
    await invoke("vec-document-index-content", indexParams);
    return true;
  } catch (error) {
    console.error("索引内容失败:", error);
    return false;
  }
};

// 批量索引内容
export const batchIndexVecDocumentContent = async (
  items: Array<IndexParams>,
): Promise<boolean> => {
  try {
    await invoke("vec-document-batch-index-content", items);
    return true;
  } catch (error) {
    console.error("批量索引内容失败:", error);
    return false;
  }
};

// 移除索引
export const removeVecDocumentIndex = async (
  id: number,
  type: string,
): Promise<boolean> => {
  try {
    await invoke("vec-document-remove-index", id, type);
    return true;
  } catch (error) {
    console.error("移除索引失败:", error);
    return false;
  }
};

// 获取所有FTS索引结果
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

export const checkVecDocumentIndexStatus = async (
  id: number,
  type: IndexType,
): Promise<{ updateTime: number } | null> => {
  try {
    return await invoke("vec-document-check-index-exists", id, type);
  } catch (error) {
    console.error("检查向量索引状态失败:", error);
    return null;
  }
};

export const clearVecDocumentTable = async (): Promise<boolean> => {
  try {
    return await invoke("clear-vec-document-table");
  } catch (error) {
    console.error("清空向量索引表失败:", error);
    return false;
  }
};

export const initVecDocumentTable = async (
  vecLength: number,
): Promise<boolean> => {
  try {
    return await invoke("init-vec-document-table", vecLength);
  } catch (error) {
    console.error("初始化向量索引表失败:", error);
    return false;
  }
};
