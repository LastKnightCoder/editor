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
}
