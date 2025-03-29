import { Descendant } from "slate";

export enum ECardCategory {
  Temporary = "temporary",
  Permanent = "permanent",
  Theme = "theme",
  Literature = "literature",
}

export interface ICard {
  id: number;
  create_time: number;
  update_time: number;
  tags: string[];
  links: number[];
  content: Descendant[];
  category: ECardCategory;
  count: number;
  contentId: number;
}

export type ICreateCard = Omit<
  ICard,
  "id" | "create_time" | "update_time" | "contentId"
>;
export type IUpdateCard = Omit<ICard, "create_time" | "update_time">;

export interface ICardTree {
  tag: string;
  children: ICardTree[];
  cardIds: number[];
}
