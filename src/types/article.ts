import {Descendant} from "slate";

export interface IArticle {
  id: number;
  title: string;
  author: string;
  create_time: number;
  update_time: number;
  tags: string[];
  links: number[];
  content: Descendant[];
  bannerBg: string;
  isTop: boolean;
  isDelete: boolean;
}
