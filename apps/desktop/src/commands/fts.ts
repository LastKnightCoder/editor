import { invoke } from "../electron";
import { SearchParams, SearchResult } from "@/types";

export const searchHybridContent = async (searchParams: SearchParams): Promise<SearchResult[]> => {
  return invoke("search-hybrid-content", searchParams);
};
