import { Descendant } from "slate";
import { IPodcast } from "./podcast";

export interface ICard {
  id: number;
  create_time: number;
  update_time: number;
  tags: string[];
  links: number[];
  content: Descendant[];
  count: number;
  contentId: number;
  isTop: boolean;
  podcastId?: number;
  podcast?: IPodcast;
}

export type ICreateCard = Omit<ICard, "id" | "create_time" | "update_time" | "contentId">;
export type IUpdateCard = Omit<ICard, "create_time" | "update_time" | "content" | "count">;

export type CardMetadataPatch = Partial<Pick<ICard, "tags" | "links" | "isTop">>;

export interface CardDatabaseScope {
  databaseName: string;
}

export interface ICardTree {
  tag: string;
  children: ICardTree[];
  cardIds: number[];
}
