import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { Descendant } from "slate";
import { IPodcast } from "./podcast";

export interface ICard {
  contracts?: ContentContractDictionary;
  id: number;
  create_time: number;
  update_time: number;
  tags: string[];
  /** 显式连接数（content_links，按正文计；共用正文的身份共享） */
  linkCount: number;
  content: Descendant[];
  count: number;
  contentId: number;
  isTop: boolean;
  podcastId?: number;
  podcast?: IPodcast;
  /** AI 生成的精简标题（content_ai_meta），没有时取正文开头，见 utils/card-title */
  aiTitle?: string;
}

export type ICreateCard = Omit<
  ICard,
  "id" | "create_time" | "update_time" | "contentId" | "linkCount"
>;
export type IUpdateCard = Omit<
  ICard,
  "create_time" | "update_time" | "content" | "contracts" | "count" | "linkCount"
>;

export type CardMetadataPatch = Partial<Pick<ICard, "tags" | "isTop">>;

export interface CardDatabaseScope {
  databaseName: string;
}

export interface ICardTree {
  tag: string;
  children: ICardTree[];
  cardIds: number[];
}
