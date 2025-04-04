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
  checkFTSIndexStatus,
  checkVecDocumentIndexStatus,
} from "@/commands";

/**
 * 搜索内容 - 同时使用全文搜索和向量搜索，并合并结果
 * @param searchParams 搜索参数
 * @returns 合并后的搜索结果数组
 */
export const searchContent = async (
  searchParams: SearchParams,
): Promise<SearchResult[]> => {
  try {
    // 并行执行全文搜索和向量搜索
    const [ftsResults, vecResults] = await Promise.all([
      searchFTS(searchParams),
      // 如果有模型信息，则执行向量搜索，否则只执行全文搜索
      searchParams.modelInfo
        ? searchVecDocument(searchParams)
        : Promise.resolve([]),
    ]);

    const ftsResultsArray = ftsResults || [];
    const vecResultsArray = vecResults || [];

    // 用于存储最终合并结果
    const mergedResults: SearchResult[] = [];

    // 记录已添加到结果的项目ID和类型
    const addedItems = new Set<string>();

    // 首先按照vecResults的顺序添加公共部分
    vecResultsArray.forEach((vecItem) => {
      const key = `${vecItem.id}-${vecItem.type}`;
      const existsInFts = ftsResultsArray.some(
        (ftsItem) => ftsItem.id === vecItem.id && ftsItem.type === vecItem.type,
      );

      if (existsInFts) {
        mergedResults.push(vecItem);
        addedItems.add(key);
      }
    });

    // 收集两个结果集中不同的部分
    const uniqueVecResults = vecResultsArray.filter(
      (item) => !addedItems.has(`${item.id}-${item.type}`),
    );

    const uniqueFtsResults = ftsResultsArray.filter(
      (item) => !addedItems.has(`${item.id}-${item.type}`),
    );

    // 交叉排序不同部分
    const maxLength = Math.max(
      uniqueVecResults.length,
      uniqueFtsResults.length,
    );
    for (let i = 0; i < maxLength; i++) {
      if (i < uniqueVecResults.length) {
        mergedResults.push(uniqueVecResults[i]);
      }

      if (i < uniqueFtsResults.length) {
        mergedResults.push(uniqueFtsResults[i]);
      }
    }

    return mergedResults;
  } catch (error) {
    console.error("搜索内容失败:", error);
    return [];
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
    const indexTypes = indexParams.indexTypes || ["fts", "vec"];
    const promises: Promise<boolean>[] = [];

    // 根据指定的索引类型执行相应的索引操作
    if (indexTypes.includes("fts")) {
      promises.push(indexFTSContent(indexParams));
    }

    if (indexTypes.includes("vec") && indexParams.modelInfo) {
      promises.push(indexVecDocumentContent(indexParams));
    }

    // 如果没有需要执行的索引操作，直接返回true
    if (promises.length === 0) {
      return true;
    }

    // 执行所有需要的索引操作
    const results = await Promise.all(promises);

    // 只有当所有操作都成功时，才返回true
    return results.every((result) => result);
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

const getResultStatus = (
  result: { updateTime: number } | null,
  updateTime: number,
): "unindexed" | "indexed" | "outdated" => {
  if (!result) {
    return "unindexed";
  }
  // 如果等于当前时间
  if (result.updateTime === updateTime) {
    return "indexed";
  } else {
    return "outdated";
  }
};

/**
 * 获取索引状态
 * @param id 内容ID
 * @param type 内容类型
 * @returns 索引状态对象
 */
export const getIndexStatus = async (
  id: number,
  type: IndexType,
  updateTime: number,
): Promise<{
  ftsStatus: "unindexed" | "indexed" | "outdated";
  vecStatus: "unindexed" | "indexed" | "outdated";
  status: "unindexed" | "indexed" | "outdated";
}> => {
  const [ftsResult, vecResult] = await Promise.all([
    checkFTSIndexStatus(id, type),
    checkVecDocumentIndexStatus(id, type),
  ]);

  // 确定FTS索引状态
  const ftsStatus = getResultStatus(ftsResult, updateTime);
  const vecStatus = getResultStatus(vecResult, updateTime);

  // 确定综合状态
  let status: "unindexed" | "indexed" | "outdated";
  if (ftsStatus === "unindexed" && vecStatus === "unindexed") {
    status = "unindexed";
  } else if (ftsStatus === "indexed" && vecStatus === "indexed") {
    status = "indexed";
  } else {
    status = "outdated";
  }

  return {
    ftsStatus,
    vecStatus,
    status,
  };
};
