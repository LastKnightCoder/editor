import { Descendant } from "slate";

export type IndexType = "card" | "article" | "project-item" | "document-item";

export interface SearchResult {
  id: number;
  type: IndexType;
  title?: string;
  source: "fts" | "vec-document";
  updateTime: number;
  content: Descendant[];
}

export interface IndexParams {
  id: number;
  content: string;
  type: IndexType;
  updateTime: number;
  title?: string;
  modelInfo?: { key: string; model: string; baseUrl: string };
}

export interface SearchParams {
  query: string;
  types?: IndexType[];
  limit?: number;
  modelInfo?: { key: string; model: string; baseUrl: string };
}
