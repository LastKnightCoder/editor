import { Descendant } from "slate";
import type { MaterialInfo, MaterialKind } from "@/entity/material";
import type { EmbeddingProviderType } from "./embedding";
import type { ContentSection } from "@/entity/sections";

/** 我的思考：卡片、文章、项目文档、日记 */
export type ContentIndexType = "card" | "article" | "project-item" | "diary-moment";
/** 主库向量 / 全文索引的类型：正文实体 + 外部材料（摘录、PDF 标注、剪藏，KL-037）+ 插件自建内容 */
export type IndexType = ContentIndexType | MaterialKind | "plugin-entity";
/** 只进向量、不进全文与检索结果的类型：主对话里的用户提问（KL-064），id 为「会话 id#消息 id」 */
export type ChatPromptIndexType = "chat-prompt";

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
  /** 插件内容的来源插件与类型，展示时取插件声明的类型名 */
  pluginEntity?: { pluginId: string; kind: string };
  // 日记特有字段
  date?: string;
  score?: number;
  snippet?: string;
  section?: Pick<ContentSection, "chunkIndex" | "headingPath" | "text" | "blockStart" | "blockEnd">;
  debug?: {
    rrfScore?: number;
    stage?: string;
  };
}

/** 写向量的参数：比 IndexParams 多容纳只进向量的提问（字符串 id） */
export interface VecIndexParams extends Omit<IndexParams, "id" | "type"> {
  id: number | string;
  type: IndexType | ChatPromptIndexType;
}

export interface IndexParams {
  id: number;
  content: string;
  title?: string;
  sections?: ContentSection[];
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
