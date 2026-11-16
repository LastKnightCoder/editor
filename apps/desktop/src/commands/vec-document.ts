import { invoke } from "../electron";
import { SearchResult, IndexType } from "@/types";

export const getAllVecDocumentResults = async (type?: IndexType): Promise<SearchResult[]> => {
  try {
    return await invoke("get-all-vec-document-results", type);
  } catch (error) {
    console.error("获取向量索引结果失败:", error);
    return [];
  }
};
