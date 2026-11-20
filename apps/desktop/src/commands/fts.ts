import { invoke } from "../electron";
import { SearchParams, SearchResult } from "@/types";

export const searchHybridContent = async (searchParams: SearchParams): Promise<SearchResult[]> => {
  try {
    return await invoke("search-hybrid-content", searchParams);
  } catch (error) {
    console.error("混合搜索失败:", error);
    return [];
  }
};
