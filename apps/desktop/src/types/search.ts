import { Descendant } from "slate";

export type IndexType =
  | "card"
  | "article"
  | "project-item"
  | "document-item"
  | "diary-daily"
  | "diary-weekly"
  | "diary-monthly";

export interface SearchResult {
  id: number;
  contentId: number;
  type: IndexType;
  title: string;
  source: "fts" | "vec-document";
  updateTime: number;
  content: Descendant[];
  // 日记特有字段
  date?: string;
}

export interface IndexParams {
  id: number;
  content: string;
  type: IndexType;
  updateTime: number;
  modelInfo?: {
    key: string;
    model: string;
    baseUrl: string;
    dimensions: number;
  };
  indexTypes?: ("fts" | "vec")[];
}

export interface SearchParams {
  query: string;
  types?: IndexType[];
  limit?: number;
  modelInfo?: {
    key: string;
    model: string;
    baseUrl: string;
    distance: number;
    dimensions: number;
  };
}
