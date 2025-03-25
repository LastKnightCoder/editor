import { SearchParams, SearchResult, IndexParams, IndexType } from "@/types";
import {
  searchFTS,
  indexFTSContent,
  batchIndexFTSContent,
  removeFTSIndex,
  searchVecDocument,
  indexVecDocumentContent,
  batchIndexVecDocumentContent,
  removeVecDocumentIndex,
  getAllFTSResults,
  getAllVecDocumentResults,
} from "@/commands/search";
import { getVecDocumentsByRef } from "@/commands/vec-document";
import { invoke } from "@/electron";

/**
 * 搜索内容 - 同时使用全文搜索和向量搜索
 * @param searchParams 搜索参数
 * @returns 搜索结果数组
 */
export const searchContent = async (
  searchParams: SearchParams,
): Promise<[SearchResult[], SearchResult[]]> => {
  try {
    // 并行执行全文搜索和向量搜索
    const [ftsResults, vecResults] = await Promise.all([
      searchFTS(searchParams),
      // 如果有模型信息，则执行向量搜索，否则只执行全文搜索
      searchParams.modelInfo
        ? searchVecDocument(searchParams)
        : Promise.resolve([]),
    ]);

    console.log(ftsResults);
    console.log(vecResults);

    return [ftsResults || [], vecResults || []];
  } catch (error) {
    console.error("搜索内容失败:", error);
    return [[], []];
  }
};

/**
 * 获取所有索引结果
 * @param type 内容类型（可选）
 * @returns [FTS索引结果, 向量索引结果]
 */
export const getAllIndexResults = async (
  type?: IndexType,
): Promise<[SearchResult[], SearchResult[]]> => {
  try {
    // 并行获取FTS和向量索引结果
    const [ftsResults, vecResults] = await Promise.all([
      getAllFTSResults(type),
      getAllVecDocumentResults(type),
    ]);

    console.log("获取索引结果成功", ftsResults, vecResults);

    return [ftsResults || [], vecResults || []];
  } catch (error) {
    console.error("获取索引结果失败:", error);
    return [[], []];
  }
};

/**
 * 索引内容 - 同时使用全文索引和向量索引
 * @param indexParams 索引参数
 * @returns 是否成功
 */
export const indexContent = async (
  indexParams: IndexParams,
): Promise<boolean> => {
  try {
    // 并行执行全文索引和向量索引
    const [ftsResult, vecResult] = await Promise.all([
      indexFTSContent(indexParams),
      // 如果有模型信息，则执行向量索引，否则只执行全文索引
      indexParams.modelInfo
        ? indexVecDocumentContent(indexParams)
        : Promise.resolve(true),
    ]);

    // 只有当两者都成功时，才返回成功
    return ftsResult && vecResult;
  } catch (error) {
    console.error("索引内容失败:", error);
    return false;
  }
};

/**
 * 批量索引内容 - 同时使用全文索引和向量索引
 * @param items 索引参数数组
 * @returns 是否成功
 */
export const batchIndexContent = async (
  items: Array<IndexParams>,
): Promise<boolean> => {
  try {
    // 并行执行全文索引和向量索引
    const [ftsResult, vecResult] = await Promise.all([
      batchIndexFTSContent(items),
      // 如果有任何一项有模型信息，则执行向量索引
      items.some((item) => !!item.modelInfo)
        ? batchIndexVecDocumentContent(items)
        : Promise.resolve(true),
    ]);

    // 只有当两者都成功时，才返回成功
    return ftsResult && vecResult;
  } catch (error) {
    console.error("批量索引内容失败:", error);
    return false;
  }
};

/**
 * 移除索引 - 同时移除全文索引和向量索引
 * @param id 内容 ID
 * @param type 内容类型
 * @returns 是否成功
 */
export const removeIndex = async (
  id: number,
  type: IndexType,
): Promise<boolean> => {
  try {
    // 并行执行移除全文索引和向量索引
    const [ftsResult, vecResult] = await Promise.all([
      removeFTSIndex(id, type),
      removeVecDocumentIndex(id, type),
    ]);

    // 只有当两者都成功时，才返回成功
    return ftsResult && vecResult;
  } catch (error) {
    console.error("移除索引失败:", error);
    return false;
  }
};

/**
 * 检查FTS索引状态
 * @param id 内容ID
 * @param type 内容类型
 * @returns 是否已索引
 */
export const checkFTSIndexStatus = async (
  id: number,
  type: IndexType,
): Promise<boolean> => {
  try {
    // 调用Electron的IPC接口检查FTS索引状态
    return await invoke("fts-check-index-exists", id, type);
  } catch (error) {
    console.error("检查FTS索引状态失败:", error);
    return false;
  }
};

/**
 * 检查向量索引状态
 * @param id 内容ID
 * @param type 内容类型
 * @returns 是否已索引
 */
export const checkVecIndexStatus = async (
  id: number,
  type: IndexType,
): Promise<boolean> => {
  try {
    // 获取向量文档
    const vecDocs = await getVecDocumentsByRef(id, type);
    return vecDocs.length > 0;
  } catch (error) {
    console.error("检查向量索引状态失败:", error);
    return false;
  }
};

/**
 * 获取索引状态
 * @param id 内容ID
 * @param type 内容类型
 * @param updateTime 内容更新时间
 * @param vecUpdateTime 向量更新时间（如果有）
 * @returns 索引状态对象
 */
export const getIndexStatus = async (
  id: number,
  type: IndexType,
  updateTime: number,
  vecUpdateTime?: number,
): Promise<{
  ftsStatus: "unindexed" | "indexed";
  vecStatus: "unindexed" | "indexed" | "outdated";
  status: "unindexed" | "partial" | "indexed" | "outdated";
}> => {
  // 并行检查FTS和向量索引状态
  const [hasFTSIndex, hasVecIndex] = await Promise.all([
    checkFTSIndexStatus(id, type),
    checkVecIndexStatus(id, type),
  ]);

  // 确定FTS索引状态
  const ftsStatus = hasFTSIndex ? "indexed" : "unindexed";

  // 确定向量索引状态
  let vecStatus: "unindexed" | "indexed" | "outdated" = "unindexed";
  if (hasVecIndex) {
    // 如果有向量索引，检查是否过期
    if (vecUpdateTime && updateTime > vecUpdateTime) {
      vecStatus = "outdated";
    } else {
      vecStatus = "indexed";
    }
  }

  // 确定综合状态
  let status: "unindexed" | "partial" | "indexed" | "outdated";
  if (!hasFTSIndex && !hasVecIndex) {
    status = "unindexed";
  } else if (hasFTSIndex && hasVecIndex) {
    status = vecStatus === "outdated" ? "outdated" : "indexed";
  } else {
    status = "partial";
  }

  return {
    ftsStatus,
    vecStatus,
    status,
  };
};
