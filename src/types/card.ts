import { Descendant } from "slate";

export enum ECardCategory {
  Temporary = "temporary",
  Permanent = "permanent",
  Theme = "theme",
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
}

export type ICreateCard = Omit<ICard, "id" | "create_time" | "update_time">;
export type IUpdateCard = Omit<ICard, "update_time">;

export interface ICardTree {
  tag: string;
  children: ICardTree[];
  cardIds: number[];
}
