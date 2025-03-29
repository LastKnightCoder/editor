import { Descendant } from "slate";

export interface ICreateArticle {
  title: string;
  author: string;
  tags: string[];
  links: number[];
  content: Descendant[];
  bannerBg: string;
  bannerPosition?: string;
  isTop: boolean;
  isDelete: boolean;
  count: number;
}

export interface IUpdateArticle extends Partial<ICreateArticle> {
  id: number;
  contentId: number;
}

export interface IArticle extends ICreateArticle {
  id: number;
  create_time: number;
  update_time: number;
  contentId: number;
}
