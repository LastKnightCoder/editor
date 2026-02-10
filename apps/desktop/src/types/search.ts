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
    configId?: string;
    providerType?: "remote_openai" | "local_python";
    key?: string;
    model: string;
    baseUrl?: string;
    dimensions: number;
    batchSize?: number;
    devicePolicy?: "auto" | "cpu" | "cuda";
    localModelDir?: string;
  };
  indexTypes?: ("fts" | "vec")[];
}

export interface SearchParams {
  query: string;
  types?: IndexType[];
  limit?: number;
  modelInfo?: {
    configId?: string;
    providerType?: "remote_openai" | "local_python";
    key?: string;
    model: string;
    baseUrl?: string;
    distance: number;
    dimensions: number;
    batchSize?: number;
    devicePolicy?: "auto" | "cpu" | "cuda";
    localModelDir?: string;
  };
}
