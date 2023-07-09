import {Descendant} from "slate";

export interface ICard {
  id: number;
  create_time: number;
  update_time: number;
  tags: string[];
  links: number[];
  content: Descendant[];
}
