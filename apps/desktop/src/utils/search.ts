import { SearchParams, SearchResult, IndexType } from "@/types";
import { bindDatabaseCommands, type CommandScope } from "@/services/command-context";
import { searchHybridContent, getAllVecDocumentResults } from "@/commands";

/**
 * 搜索内容 - 使用统一 hybrid pipeline（扩展/多路召回/RRF/重排/混排）
 * @param searchParams 搜索参数
 * @returns 排序后的搜索结果数组
 */
export const searchContent = async (
  searchParams: SearchParams,
  scope?: CommandScope
): Promise<SearchResult[]> => {
  try {
    return await bindDatabaseCommands({ searchHybridContent }, scope).searchHybridContent(
      searchParams
    );
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
export const getAllIndexResults = async (type?: IndexType): Promise<SearchResult[]> => {
  try {
    // 并行获取FTS和向量索引结果
    const vecResults = await getAllVecDocumentResults(type);

    return vecResults;
  } catch (error) {
    console.error("获取索引结果失败:", error);
    return [];
  }
};
