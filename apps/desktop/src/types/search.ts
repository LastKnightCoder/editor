import { Descendant } from "slate";
import type { MaterialInfo, MaterialKind } from "@/entity/material";
import type { EmbeddingProviderType } from "./embedding";

/** 我的思考：卡片、文章、项目文档、日记 */
export type ContentIndexType = "card" | "article" | "project-item" | "diary-daily";
/** 主库向量 / 全文索引的类型：正文实体 + 外部材料（摘录、PDF 标注、剪藏，KL-037） */
export type IndexType = ContentIndexType | MaterialKind;

export interface SearchResult {
  id: number;
  contentId: number;
  type: IndexType;
  title: string;
  source: "fts" | "vec-document";
  updateTime: number;
  content: Descendant[];
  /** 外部材料的展示信息与打开目标（材料结果没有可打开的正文，contentId 为剪藏解析文档或 0） */
  material?: MaterialInfo;
  // 日记特有字段
  date?: string;
  score?: number;
  snippet?: string;
  debug?: {
    rrfScore?: number;
    stage?: string;
  };
}

export interface IndexParams {
  id: number;
  content: string;
  type: IndexType;
  updateTime: number;
  modelInfo?: {
    configId?: string;
    providerType?: EmbeddingProviderType;
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
    providerType?: EmbeddingProviderType;
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
