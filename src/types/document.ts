import { Descendant } from "slate";

export interface IDocument {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  desc: string;
  authors: string[];
  children: number[];
  tags: string[];
  links: number[];
  content: Descendant[];
  bannerBg: string;
  icon: string;
  isTop: boolean;
  isDelete: boolean;
}

export interface IUpdateDocument {
  title: string;
  desc: string;
  authors: string[];
  children: number[];
  tags: string[];
  links: number[];
  content: Descendant[];
  bannerBg: string;
  icon: string;
  isTop: boolean;
}

export type ICreateDocument = Exclude<IUpdateDocument, 'id'>;
export type IDeleteDocument = Pick<IDocument, 'id'>;

export interface IDocumentItem {
  id: number;
  createTime: number;
  updateTime: number;
  title: string;
  authors: string[];
  tags: string[];
  isDirectory: boolean;
  children: number[];
  isArticle: boolean;
  articleId: number;
  isCard: boolean;
  cardId: number;
  content: Descendant[];
  bannerBg: string;
  icon: string;
  isDelete: boolean;
}

export interface ICreateDocumentItem {
  title: string;
  authors: string[];
  tags: string[];
  isDirectory: boolean;
  children: number[];
  isArticle: boolean;
  articleId: number;
  isCard: boolean;
  cardId: number;
  content: Descendant[];
  bannerBg: string;
  icon: string;
}

export type IUpdateDocumentItem = Exclude<IDocumentItem, 'id' | 'is_delete'>;
export type IDeleteDocumentItem = Pick<IDocumentItem, 'id'>;